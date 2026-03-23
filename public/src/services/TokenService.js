/**
 * KIP · src/services/TokenService.js
 * ─────────────────────────────────────────────────────────────────
 * Gestión centralizada del ciclo de vida del token de sesión.
 *
 * Estrategia de almacenamiento:
 *
 *   PRODUCCIÓN (USE_REAL_API = true):
 *     El token viaja en una cookie httpOnly emitida por el servidor.
 *     El frontend NO almacena ni lee el token directamente.
 *     TokenService solo lee los metadatos públicos del JWT (payload)
 *     para saber si hay sesión activa sin exponer el token.
 *
 *   DESARROLLO (mock):
 *     Token demo en sessionStorage (se borra al cerrar el browser).
 *     Si "Recordarme" → localStorage (persiste entre sesiones).
 *
 * Seguridad:
 *   - Nunca expone el token a JS en producción (cookie httpOnly)
 *   - Token demo no tiene valor fuera del entorno mock
 *   - Limpia AMBOS storages al hacer logout (evita tokens huérfanos)
 *   - Valida expiración localmente antes de cualquier request
 */

import { KIP_CONFIG } from '../config.js';

const { TOKEN, NOMBRE } = KIP_CONFIG.KEYS;
const REFRESH_ENDPOINT  = `${KIP_CONFIG.API_BASE}/auth/refresh`;
const LOGOUT_ENDPOINT   = `${KIP_CONFIG.API_BASE}/auth/logout`;

// ── Helpers internos ──────────────────────────────────────────────

/**
 * Decodifica el payload de un JWT sin verificar la firma.
 * La verificación siempre la hace el servidor.
 * @param {string} token
 * @returns {object|null}
 */
function _decodePayload(token) {
  try {
    const base64 = token.split('.')[1];
    if (!base64) return null;
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Lee el token del almacenamiento activo (sessionStorage → localStorage).
 * En modo real, el token está en cookie httpOnly y este método retorna null
 * para indicar que no hay token accesible desde JS.
 */
function _readToken() {
  if (KIP_CONFIG.USE_REAL_API) return null; // cookie httpOnly — JS no puede leerlo
  try {
    return sessionStorage.getItem(TOKEN) || localStorage.getItem(TOKEN) || null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
export const TokenService = {

  // ── Almacenamiento ─────────────────────────────────────────────

  /**
   * Guarda el token de sesión de forma segura.
   * En producción este método NO debe llamarse — el servidor emite
   * la cookie httpOnly directamente en la respuesta del login.
   *
   * @param {string}  token
   * @param {boolean} remember — true → localStorage, false → sessionStorage
   */
  save(token, remember = false) {
    if (KIP_CONFIG.USE_REAL_API) {
      // En modo real nunca guardamos el token desde el frontend.
      // El servidor lo gestiona vía cookie httpOnly.
      console.warn('[TokenService] save() llamado en modo real — ignorado.');
      return;
    }
    try {
      // Limpiar el otro storage antes de guardar (evitar tokens duplicados)
      sessionStorage.removeItem(TOKEN);
      localStorage.removeItem(TOKEN);

      if (remember) {
        localStorage.setItem(TOKEN, token);
      } else {
        sessionStorage.setItem(TOKEN, token);
      }
    } catch (err) {
      console.error('[TokenService] No se pudo guardar el token:', err);
    }
  },

  /**
   * Elimina el token de ambos storages y notifica al servidor (logout).
   * Llama al endpoint de logout para invalidar la cookie httpOnly en producción.
   */
  async revoke() {
    // 1. Limpiar almacenamiento local (aplica en mock y producción)
    try {
      sessionStorage.removeItem(TOKEN);
      localStorage.removeItem(TOKEN);
      // Limpiar también el nombre de usuario almacenado localmente
      sessionStorage.removeItem(NOMBRE);
      localStorage.removeItem(NOMBRE);
    } catch { /* storage no disponible — continuar */ }

    // 2. En modo real: invalidar la cookie httpOnly en el servidor
    if (KIP_CONFIG.USE_REAL_API) {
      try {
        await fetch(LOGOUT_ENDPOINT, {
          method:      'POST',
          credentials: 'include',  // envía la cookie httpOnly
          headers:     { 'Content-Type': 'application/json' },
        });
      } catch {
        // Si el logout falla por red, la sesión caducará sola.
        // No bloquear el flujo de cierre de sesión del usuario.
      }
    }
  },

  // ── Verificación ───────────────────────────────────────────────

  /**
   * Indica si hay una sesión activa.
   *
   * Modo real:    verifica la presencia de la cookie 'kip_session' o el
   *               flag __kip_authed que el servidor inyecta en el HTML
   *               (una cookie NO httpOnly que solo sirve como indicador).
   *
   * Modo mock:    verifica el token en sessionStorage/localStorage.
   */
  isAuthenticated() {
    if (KIP_CONFIG.USE_REAL_API) {
      // El servidor puede inyectar un flag público (no secreto):
      // <script>window.__kip_authed = true;</script>
      // Esto evita hacer fetch para saber si hay sesión.
      if (typeof window !== 'undefined' && window.__kip_authed === true) return true;

      // Fallback: buscar la cookie indicador (NO el token)
      return document.cookie.split(';').some(c => c.trim().startsWith('kip_authed='));
    }

    const token = _readToken();
    if (!token) return false;

    // Verificar expiración del JWT localmente (sin llamada al servidor)
    const payload = _decodePayload(token);
    if (!payload) return false;
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      // Token expirado — limpiarlo del storage
      this.revoke();
      return false;
    }
    return true;
  },

  /**
   * Devuelve el tiempo en ms hasta que expira el token actual.
   * Retorna 0 si no hay token o ya expiró.
   */
  getExpiresIn() {
    const token   = _readToken();
    const payload = _decodePayload(token);
    if (!payload?.exp) return 0;
    return Math.max(0, payload.exp * 1000 - Date.now());
  },

  /**
   * Devuelve el sub (user ID) del token actual, o null.
   */
  getUserId() {
    const token   = _readToken();
    const payload = _decodePayload(token);
    return payload?.sub ?? null;
  },

  // ── Refresh automático ─────────────────────────────────────────

  /**
   * Solicita un token nuevo al servidor antes de que expire el actual.
   * Llama automáticamente cuando quedan menos de REFRESH_THRESHOLD ms.
   *
   * En producción el servidor rota la cookie httpOnly.
   * En mock, actualiza el token en storage.
   *
   * @returns {boolean} true si el refresh fue exitoso
   */
  async refresh() {
    if (!KIP_CONFIG.USE_REAL_API) {
      // En mock, simplemente extender la demo-session
      console.debug('[TokenService] refresh() en mock — no-op');
      return true;
    }
    try {
      const res = await fetch(REFRESH_ENDPOINT, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  /**
   * Inicia el temporizador automático de refresh.
   * Llama a refresh() cuando quedan REFRESH_THRESHOLD ms para expirar.
   * Se debe llamar después de un login exitoso.
   */
  startAutoRefresh() {
    const REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutos antes de expirar
    const expiresIn = this.getExpiresIn();
    if (expiresIn <= 0) return;

    const delay = Math.max(0, expiresIn - REFRESH_THRESHOLD);
    this._refreshTimer = setTimeout(async () => {
      const ok = await this.refresh();
      if (ok) {
        this.startAutoRefresh(); // reprogramar para el siguiente ciclo
      } else {
        // Refresh falló — cerrar sesión limpiamente
        await this.revoke();
        window.location.replace('../../app/login/?reason=session_expired');
      }
    }, delay);

    console.debug(`[TokenService] auto-refresh programado en ${Math.round(delay / 1000)}s`);
  },

  stopAutoRefresh() {
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
  },
};
