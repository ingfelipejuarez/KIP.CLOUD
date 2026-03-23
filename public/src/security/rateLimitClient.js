/**
 * KIP · src/security/rateLimitClient.js
 * ─────────────────────────────────────────────────────────────────
 * Rate limiting en el lado del cliente.
 *
 * Complementa el rate limiting del servidor (nginx) con una capa
 * adicional en el frontend que:
 *   - Previene spam de formularios (login, registro)
 *   - Añade backoff exponencial tras errores 429
 *   - Bloquea temporalmente botones después de N intentos fallidos
 *   - Implementa debounce para inputs de búsqueda
 *
 * Nota: el rate limiting real siempre está en el servidor.
 *       Esta capa es UX + defensa en profundidad, no el único control.
 */

// ── Almacén de intentos ──────────────────────────────────────────
const _attempts = new Map(); // key → { count, firstAt, lockedUntil }

// ── RateLimiter configurable ─────────────────────────────────────

/**
 * @typedef {Object} RateLimitConfig
 * @property {number} maxAttempts  — intentos permitidos en la ventana
 * @property {number} windowMs     — tamaño de la ventana en ms
 * @property {number} lockoutMs    — tiempo de bloqueo tras superar el límite
 * @property {number} backoffBase  — multiplicador del backoff exponencial
 */

export class RateLimiter {
  /**
   * @param {string}          key    — identificador único (ej: 'login', 'register')
   * @param {RateLimitConfig} config
   */
  constructor(key, config = {}) {
    this.key         = key;
    this.maxAttempts = config.maxAttempts ?? 5;
    this.windowMs    = config.windowMs    ?? 60000; // 1 minuto
    this.lockoutMs   = config.lockoutMs   ?? 120000; // 2 minutos
    this.backoffBase = config.backoffBase ?? 2;
  }

  /**
   * Registra un intento y retorna si está permitido.
   * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
   */
  attempt() {
    const now  = Date.now();
    const data = _attempts.get(this.key) ?? { count: 0, firstAt: now, lockedUntil: 0 };

    // Verificar si está en periodo de bloqueo
    if (data.lockedUntil > now) {
      return {
        allowed:      false,
        remaining:    0,
        retryAfterMs: data.lockedUntil - now,
      };
    }

    // Resetear ventana si ya pasó el tiempo
    if (now - data.firstAt > this.windowMs) {
      data.count     = 0;
      data.firstAt   = now;
      data.lockedUntil = 0;
    }

    data.count++;
    _attempts.set(this.key, data);

    if (data.count > this.maxAttempts) {
      // Calcular backoff exponencial basado en cuántas veces se ha bloqueado
      const overflows = Math.floor(data.count / this.maxAttempts);
      const lockout   = this.lockoutMs * (this.backoffBase ** (overflows - 1));
      data.lockedUntil = now + Math.min(lockout, 30 * 60000); // máx 30 min
      _attempts.set(this.key, data);

      return {
        allowed:      false,
        remaining:    0,
        retryAfterMs: data.lockedUntil - now,
      };
    }

    return {
      allowed:      true,
      remaining:    this.maxAttempts - data.count,
      retryAfterMs: 0,
    };
  }

  /**
   * Registra un éxito — resetea el contador.
   */
  success() {
    _attempts.delete(this.key);
  }

  /**
   * Devuelve si actualmente está bloqueado.
   */
  isLocked() {
    const data = _attempts.get(this.key);
    if (!data) return false;
    return data.lockedUntil > Date.now();
  }

  /**
   * Tiempo en ms hasta que se desbloquea. 0 si no está bloqueado.
   */
  getRetryAfterMs() {
    const data = _attempts.get(this.key);
    if (!data || data.lockedUntil <= Date.now()) return 0;
    return data.lockedUntil - Date.now();
  }

  /**
   * Formatea el tiempo de bloqueo en texto legible.
   * @returns {string} ej: "2 minutos" o "45 segundos"
   */
  getRetryAfterText() {
    const ms = this.getRetryAfterMs();
    if (ms <= 0) return '';
    const secs = Math.ceil(ms / 1000);
    if (secs < 60) return `${secs} segundos`;
    return `${Math.ceil(secs / 60)} minutos`;
  }

  /**
   * Reset manual (ej: después de un logout).
   */
  reset() {
    _attempts.delete(this.key);
  }
}

// ── Instancias preconstruidas para los formularios de KIP ─────────

/** Rate limiter para el formulario de login: 5 intentos / 60s */
export const loginLimiter = new RateLimiter('login', {
  maxAttempts: 5,
  windowMs:    60000,
  lockoutMs:   120000,
  backoffBase: 2,
});

/** Rate limiter para registro: 3 intentos / 5min */
export const registerLimiter = new RateLimiter('register', {
  maxAttempts: 3,
  windowMs:    5 * 60000,
  lockoutMs:   10 * 60000,
  backoffBase: 2,
});

/** Rate limiter para reset de contraseña: 3 intentos / 10min */
export const resetPasswordLimiter = new RateLimiter('reset_password', {
  maxAttempts: 3,
  windowMs:    10 * 60000,
  lockoutMs:   30 * 60000,
  backoffBase: 3,
});

// ── Debounce para inputs ──────────────────────────────────────────

/**
 * Crea una versión debounceada de una función.
 * Útil para limitar peticiones durante la escritura en inputs.
 *
 * @param {Function} fn       — función a debouncer
 * @param {number}   delayMs  — delay en ms (default: 300)
 * @returns {Function}
 */
export function debounce(fn, delayMs = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

/**
 * Crea una versión throttled de una función.
 * La función se ejecuta como máximo una vez por intervalo.
 *
 * @param {Function} fn          — función a throttle
 * @param {number}   intervalMs  — intervalo mínimo entre ejecuciones
 * @returns {Function}
 */
export function throttle(fn, intervalMs = 1000) {
  let lastCall = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastCall >= intervalMs) {
      lastCall = now;
      return fn(...args);
    }
  };
}
