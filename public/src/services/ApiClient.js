/**
 * KIP · src/services/ApiClient.js
 * ─────────────────────────────────────────────────────────────────
 * Cliente HTTP centralizado y seguro para todas las llamadas al backend.
 *
 * Características de seguridad:
 *   - CSRF: doble submit cookie pattern (X-CSRF-Token en cada request)
 *   - Autenticación: cookies httpOnly en prod, Bearer token en mock
 *   - Timeout configurable por request (default 10s)
 *   - Retry con backoff exponencial para errores 5xx/red
 *   - Deduplicación de requests GET idénticos en vuelo
 *   - Limpieza automática de sesión en 401
 *   - Headers de seguridad en cada petición
 *   - Nunca expone el token en la URL ni en logs
 */

import { KIP_CONFIG }  from '../config.js';
import { TokenService } from './TokenService.js';

// ── Constantes ────────────────────────────────────────────────────
const BASE_URL        = KIP_CONFIG.API_BASE;       // '/api/v1'
const TIMEOUT         = KIP_CONFIG.REQUEST_TIMEOUT; // 10 000 ms
const MAX_RETRIES     = 2;
const RETRY_DELAY_MS  = 500;
const RETRYABLE_CODES = new Set([502, 503, 504]);

// ── Caché de requests en vuelo (deduplicación) ────────────────────
const _inFlight = new Map(); // key → Promise

// ─────────────────────────────────────────────────────────────────
export const ApiClient = {

  // ── Helpers internos ───────────────────────────────────────────

  /**
   * Lee el token CSRF de la cookie 'kip_csrf'.
   * El servidor lo emite en el login como cookie NO httpOnly.
   * El cliente lo reenvía en el header X-CSRF-Token.
   * Esto implementa el patrón "double submit cookie".
   */
  _getCsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)kip_csrf=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  },

  /**
   * Construye los headers estándar de seguridad para cada petición.
   * @param {boolean} hasBody — true si la petición tiene cuerpo (POST/PUT/PATCH)
   * @returns {Headers}
   */
  _buildHeaders(hasBody = false) {
    const headers = new Headers({
      'Accept':           'application/json',
      'X-Requested-With': 'XMLHttpRequest', // distingue XHR de navegación directa
      'X-App-Version':    KIP_CONFIG.VERSION,
    });

    if (hasBody) {
      headers.set('Content-Type', 'application/json');
    }

    // CSRF token en requests que mutan estado
    const csrf = this._getCsrfToken();
    if (csrf) {
      headers.set('X-CSRF-Token', csrf);
    }

    // En modo mock: Bearer token para pruebas sin cookie httpOnly
    if (!KIP_CONFIG.USE_REAL_API) {
      const token = this.getToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
    }

    return headers;
  },

  /**
   * Ejecuta un fetch con timeout mediante AbortController.
   */
  async _fetchWithTimeout(url, options, timeoutMs = TIMEOUT) {
    const controller = new AbortController();
    const timerId    = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
      if (err.name === 'AbortError') {
        const e = new Error('Request timeout');
        e.isNetworkError = true;
        e.isTimeout      = true;
        throw e;
      }
      const e = new Error('Network error');
      e.isNetworkError = true;
      e.cause          = err;
      throw e;
    } finally {
      clearTimeout(timerId);
    }
  },

  /**
   * Maneja la respuesta HTTP: parsea JSON, lanza errores tipificados.
   */
  async _handleResponse(res) {
    // Sesión expirada o token inválido
    if (res.status === 401) {
      await TokenService.revoke();
      window.location.replace('../../app/login/?reason=unauthorized');
      throw Object.assign(new Error('Unauthorized'), { status: 401 });
    }

    // Parsear cuerpo
    const contentType = res.headers.get('Content-Type') || '';
    const body = contentType.includes('application/json')
      ? await res.json().catch(() => ({}))
      : await res.text().catch(() => '');

    if (!res.ok) {
      const err    = new Error(body?.message || `HTTP ${res.status}`);
      err.status   = res.status;
      err.body     = body;
      err.response = res;
      throw err;
    }

    return body;
  },

  /**
   * Núcleo de todas las peticiones. Incluye retry con backoff.
   */
  async _request(method, path, { body, query, timeout } = {}) {
    const url = new URL(
      `${BASE_URL}${path}`,
      window.location.origin
    );

    if (query) {
      Object.entries(query).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, v);
      });
    }

    const hasBody = Boolean(body);
    const options = {
      method,
      headers:     this._buildHeaders(hasBody),
      credentials: 'include', // envía cookies httpOnly automáticamente
    };

    if (hasBody) {
      options.body = JSON.stringify(body);
    }

    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS * 2 ** (attempt - 1)));
          console.debug(`[ApiClient] retry ${attempt}/${MAX_RETRIES} → ${method} ${path}`);
        }

        const res = await this._fetchWithTimeout(url.toString(), options, timeout);

        // No reintentar errores de cliente (4xx) excepto 429
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          return this._handleResponse(res);
        }

        // Reintentar errores de servidor (502/503/504)
        if (RETRYABLE_CODES.has(res.status) && attempt < MAX_RETRIES) {
          lastError = new Error(`HTTP ${res.status}`);
          lastError.status = res.status;
          continue;
        }

        return this._handleResponse(res);

      } catch (err) {
        if (err.status === 401) throw err; // no reintentar 401
        if (err.isNetworkError && attempt < MAX_RETRIES) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }

    throw lastError;
  },

  // ── API pública ────────────────────────────────────────────────

  get(path, opts = {}) {
    // Deduplicación: si ya hay un GET en vuelo para la misma ruta, reusar
    const key = `GET:${path}:${JSON.stringify(opts.query ?? {})}`;
    if (_inFlight.has(key)) return _inFlight.get(key);

    const promise = this._request('GET', path, opts)
      .finally(() => _inFlight.delete(key));

    _inFlight.set(key, promise);
    return promise;
  },

  post(path, body, opts = {})   { return this._request('POST',   path, { ...opts, body }); },
  put(path, body, opts = {})    { return this._request('PUT',    path, { ...opts, body }); },
  patch(path, body, opts = {})  { return this._request('PATCH',  path, { ...opts, body }); },
  delete(path, opts = {})       { return this._request('DELETE', path, opts); },

  // ── Autenticación ──────────────────────────────────────────────

  /**
   * Inicia sesión. En producción el servidor emite la cookie httpOnly.
   * En mock guarda el token demo en storage.
   */
  async login(email, password, remember = false) {
    const data = await this.post('/auth/login', { email, password });

    if (!KIP_CONFIG.USE_REAL_API && data?.token) {
      TokenService.save(data.token, remember);
    }

    // Arrancar el auto-refresh del token
    TokenService.startAutoRefresh();

    return data;
  },

  async logout() {
    TokenService.stopAutoRefresh();
    await TokenService.revoke();
  },

  // ── Compatibilidad con código existente ────────────────────────

  /**
   * Lee el token del storage (solo mock).
   * En producción siempre retorna null — el token está en cookie httpOnly.
   */
  getToken() {
    if (KIP_CONFIG.USE_REAL_API) return null;
    try {
      return sessionStorage.getItem(KIP_CONFIG.KEYS.TOKEN)
          || localStorage.getItem(KIP_CONFIG.KEYS.TOKEN)
          || null;
    } catch { return null; }
  },

  /**
   * Guarda el token en storage (solo mock).
   */
  saveToken(token, remember = false) {
    TokenService.save(token, remember);
  },

  /**
   * Verifica si hay sesión activa.
   */
  isAuthenticated() {
    return TokenService.isAuthenticated();
  },
};
