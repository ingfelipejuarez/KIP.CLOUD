/**
 * KIP · src/security.js
 * ─────────────────────────────────────────────────────────────────
 * Módulo centralizado de seguridad del cliente.
 * Re-exporta y orquesta las capas de seguridad existentes para que
 * los módulos de página solo necesiten un import.
 *
 * Capas:
 *   1. sanitizeText / esc  — prevención XSS (input → output)
 *   2. Validators           — validación tipada de formularios
 *   3. RateLimiter / presets— rate limiting en cliente
 *   4. getCsrfToken         — CSRF double-submit pattern
 *   5. safeRedirectUrl      — prevención de Open Redirect
 *   6. SecureDOM            — manipulación del DOM sin XSS
 */

// ── Re-exports de capas existentes ───────────────────────────────
export { esc, stripTags }            from './ui/utils/sanitize.js';
export { sanitizeText, sanitizeName,
         sanitizeNote, sanitizeObj,
         Validators }                from './security/inputSanitizer.js';
export { getCsrfToken,
         safeRedirectUrl,
         initMockCsrfToken }         from './security/csrf.js';
export { loginLimiter,
         registerLimiter,
         resetPasswordLimiter,
         RateLimiter,
         debounce,
         throttle }                  from './security/rateLimitClient.js';

// ── SecureDOM — helpers para manipular el DOM sin XSS ────────────
/**
 * Crea un elemento con propiedades seguras.
 * Usa textContent para texto, nunca innerHTML con datos externos.
 *
 * @param {string} tag           — nombre del elemento HTML
 * @param {object} opts
 * @param {string} [opts.text]   — contenido de texto (seguro, via textContent)
 * @param {string} [opts.html]   — HTML INTERNO CONFIABLE (solo literales de código)
 * @param {string} [opts.cls]    — className
 * @param {object} [opts.attrs]  — atributos adicionales { name: value }
 * @returns {HTMLElement}
 */
export function createElement(tag, { text, html, cls, attrs = {} } = {}) {
  const el = document.createElement(tag);
  if (cls)  el.className = cls;
  if (text !== undefined) el.textContent = text;   // SEGURO — escapa automáticamente
  if (html !== undefined) el.innerHTML   = html;   // Solo para HTML de confianza (SVG, etc.)
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

/**
 * Actualiza textContent de un elemento de forma segura.
 * Si el elemento no existe, no hace nada (no lanza error).
 *
 * @param {string|HTMLElement} target — ID o elemento
 * @param {unknown}            value  — valor a mostrar (se convierte a string)
 */
export function safeSetText(target, value) {
  const el = typeof target === 'string'
    ? document.getElementById(target)
    : target;
  if (el) el.textContent = String(value ?? '');
}

/**
 * Verifica si el contexto actual es un entorno de desarrollo mock.
 * Centraliza esta lógica que estaba duplicada en los 5 módulos.
 */
export function isMockEnv(config) {
  // [FIX-MOCK] Ampliar la detección de entorno de desarrollo para cubrir:
  //   - localhost / 127.0.0.1  — servidor de desarrollo (Live Server, Vite, etc.)
  //   - hostname vacío ('')    — apertura directa con protocolo file://
  //   - cualquier hostname     — cuando USE_REAL_API es explícitamente false
  //     (el desarrollador eligió mock; no forzar autenticación real)
  if (config.USE_REAL_API === true) return false;
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '' || location.protocol === 'file:';
}

/**
 * Auth guard centralizado.
 * Retorna true si el usuario puede continuar, false si debe redirigirse.
 * Maneja la redirección internamente.
 *
 * [FIX-03] En entornos de producción (USE_REAL_API: true) el token JWT
 *          puede estar ausente del almacenamiento local mientras la sesión
 *          es válida via cookie HttpOnly (SSO, refresh silencioso, etc.).
 *          El comportamiento anterior redirigía siempre que getToken()
 *          devolvía null, causando un bucle infinito:
 *            dashboard → login → (cookie válida) → dashboard → login → …
 *
 *          Nueva lógica:
 *            1. Entorno mock (localhost + USE_REAL_API:false) → siempre OK.
 *            2. Token en memoria/localStorage presente               → OK.
 *            3. Producción sin token: verificar con endpoint /me antes
 *               de redirigir. Si responde 2xx, la cookie es válida → OK.
 *               Si responde 401/403 o la petición falla → redirigir.
 *
 *          Para no bloquear el render, authGuard() es SÍNCRONO en los
 *          casos 1 y 2. El caso 3 devuelve una Promise<boolean> que
 *          dashboard.js debe awaitar (ver uso en launch()).
 *
 * @param {object} config     — KIP_CONFIG
 * @param {object} apiClient  — ApiClient con métodos getToken() y getBaseUrl()
 * @param {string} [loginUrl] — ruta al login (default: ../../app/login/)
 * @returns {boolean | Promise<boolean>}
 */
export function authGuard(config, apiClient, loginUrl = '../../app/login/') {
  // Caso 1 — entorno mock de desarrollo: siempre permitir
  if (isMockEnv(config)) return true;

  // Caso 2 — token disponible en memoria o localStorage: permitir de inmediato
  if (apiClient.getToken()) return true;

  // Caso 3 — producción sin token en JS: verificar sesión via cookie
  // antes de forzar una redirección que podría ser un bucle infinito
  if (config.USE_REAL_API) {
    // Evitar loop si ya estamos en la página de login
    if (window.location.pathname.includes('/login')) return true;

    const meUrl = `${config.API_BASE ?? '/api/v1'}/auth/me`;
    console.debug('[authGuard] token ausente, verificando sesión via cookie →', meUrl);

    return fetch(meUrl, {
      method: 'GET',
      credentials: 'include', // enviar cookie HttpOnly de sesión
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000), // no bloquear más de 5s
    })
      .then(res => {
        if (res.ok) {
          console.debug('[authGuard] sesión cookie válida ✓');
          return true;
        }
        // 401 / 403 → sesión real inválida, redirigir al login
        console.warn('[authGuard] sesión inválida (HTTP', res.status, ') → redirigiendo');
        window.location.replace(loginUrl);
        return false;
      })
      .catch(err => {
        // Error de red (offline, timeout, CORS) — no forzar logout para no
        // romper la app en conexiones intermitentes. Loguear y continuar.
        console.warn('[authGuard] no se pudo verificar sesión (red?):', err.message);
        // En caso de duda, permitir — el primer fetch protegido fallará con
        // 401 y la lógica de refresco de ApiClient tomará el control.
        return true;
      });
  }

  // Producción desconocida sin token y sin USE_REAL_API: redirigir
  window.location.replace(loginUrl);
  return false;
}
