/**
 * KIP · src/config.js
 * ─────────────────────────────────────────────────────────────────
 * Configuración central de la aplicación.
 * Compatible con browser nativo (sin Vite, webpack u otro build tool).
 *
 * Para producción con Vite, las variables VITE_* se inyectan en build time.
 * Para desarrollo con Live Server, se usan los valores por defecto.
 */

// ── Valores por defecto para desarrollo sin build tool ─────────────
// En producción con Vite, estos son sobreescritos por import.meta.env
const _defaults = {
  // En el monolito Railway, USE_REAL_API = true automáticamente
  // porque window.location no es localhost.
  // En desarrollo local (Live Server) sigue siendo false → modo mock.
  USE_REAL_API:         typeof window !== 'undefined'
                          && window.location.hostname !== 'localhost'
                          && window.location.hostname !== '127.0.0.1',
  DEEPSEEK_KEY:         'PLACEHOLDER', // la key vive en el backend, nunca aquí
  DEEPSEEK_MODEL:       'deepseek-chat',
  AI_REQUIRES_PREMIUM:  false,
  API_BASE:             '/api/v1',     // mismo origen → sin CORS
};

// Intentar leer variables de Vite/webpack si están disponibles
// En browser nativo import.meta.env no existe → usa _defaults
let _env = _defaults;
try {
  if (typeof import.meta !== 'undefined' &&
      import.meta.env &&
      typeof import.meta.env === 'object') {
    _env = {
      USE_REAL_API:        import.meta.env.VITE_KIP_USE_REAL_API === 'true',
      DEEPSEEK_KEY:        import.meta.env.VITE_KIP_DEEPSEEK_KEY        || _defaults.DEEPSEEK_KEY,
      DEEPSEEK_MODEL:      import.meta.env.VITE_KIP_DEEPSEEK_MODEL       || _defaults.DEEPSEEK_MODEL,
      AI_REQUIRES_PREMIUM: import.meta.env.VITE_KIP_AI_REQUIRES_PREMIUM === 'true',
      API_BASE:            import.meta.env.VITE_KIP_API_BASE              || _defaults.API_BASE,
    };
  }
} catch (_) {
  // import.meta no disponible — usar defaults
}

export const KIP_CONFIG = Object.freeze({
  USE_REAL_API:        _env.USE_REAL_API,
  DEEPSEEK_KEY:        _env.DEEPSEEK_KEY,
  DEEPSEEK_MODEL:      _env.DEEPSEEK_MODEL,
  AI_REQUIRES_PREMIUM: _env.AI_REQUIRES_PREMIUM,
  API_BASE:            _env.API_BASE,
  REQUEST_TIMEOUT:     10000,

  KEYS: Object.freeze({
    TOKEN:       'kip_token',
    NOMBRE:      'kip_nombre',
    TEMA:        'kip_tema',
    HABIT_ORDER: 'kip_habit_order',
    SOUND:       'kip_sound',
  }),

  VERSION: 'v7.0',
});
