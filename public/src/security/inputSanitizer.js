/**
 * KIP · src/security/inputSanitizer.js
 * ─────────────────────────────────────────────────────────────────
 * Sanitización y validación de entradas de usuario.
 *
 * Capas de defensa:
 *   1. esc()          — escapa HTML para renderizado seguro (en sanitize.js)
 *   2. sanitizeText() — limpia texto de caracteres de control y Unicode peligroso
 *   3. validate*()    — validadores de tipos específicos (email, nombre, nota)
 *   4. sanitizeObj()  — sanitiza recursivamente objetos de datos antes de enviarlos al API
 *
 * Principio: sanear en la entrada (antes de procesar) Y en la salida (antes de renderizar).
 */

// ── Patrones de validación ────────────────────────────────────────

const PATTERNS = {
  // Email: RFC 5322 simplificado — más estricto que includes('@')
  EMAIL: /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/,

  // Nombre: letras, espacios, guiones, apóstrofes — sin HTML
  NOMBRE: /^[a-zA-ZÀ-ÿ\u00C0-\u024F\s'\-\.]{1,80}$/,

  // Nota de hábito: texto libre pero sin tags HTML
  NOTA: /^[^<>]{0,80}$/,

  // ID de hábito: alfanumérico con guiones (UUID o nanoid)
  HABIT_ID: /^[a-zA-Z0-9_\-]{1,64}$/,

  // URL segura (solo https://)
  HTTPS_URL: /^https:\/\/[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+$/,
};

// ── Caracteres de control y Unicode peligroso ─────────────────────

// Caracteres que podrían causar confusión o ataques de invisible text
const DANGEROUS_UNICODE = /[\u0000-\u001F\u007F\u200B-\u200D\uFEFF\u2028\u2029]/g;

// Directional overrides — usados en ataques de "right-to-left override"
const BIDI_OVERRIDES = /[\u202A-\u202E\u2066-\u2069]/g;

// ── Funciones de sanitización ─────────────────────────────────────

/**
 * Limpia un string de texto:
 *   - Elimina caracteres de control
 *   - Elimina Unicode bidi overrides
 *   - Normaliza espacios múltiples
 *   - Recorta longitud máxima
 *
 * @param {unknown} value
 * @param {number}  maxLength — longitud máxima (default: 500)
 * @returns {string}
 */
export function sanitizeText(value, maxLength = 500) {
  if (value === null || value === undefined) return '';
  const str = String(value)
    .replace(DANGEROUS_UNICODE, '')
    .replace(BIDI_OVERRIDES, '')
    .trim();
  return str.slice(0, maxLength);
}

/**
 * Sanitiza un nombre de usuario:
 * Limpia caracteres peligrosos y normaliza Unicode a NFC.
 */
export function sanitizeName(value) {
  return sanitizeText(value, 80)
    .normalize('NFC')              // normalizar a forma canónica
    .replace(/\s{2,}/g, ' ')      // colapsar espacios múltiples
    .trim();
}

/**
 * Sanitiza la nota de un hábito.
 */
export function sanitizeNote(value) {
  return sanitizeText(value, 80)
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Sanitiza recursivamente todos los valores string de un objeto.
 * Útil antes de enviar datos al backend.
 *
 * @param {object} obj     — objeto a sanitizar
 * @param {number} maxLen  — longitud máxima por campo
 * @returns {object}       — nuevo objeto con strings sanitizados
 */
export function sanitizeObj(obj, maxLen = 500) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => sanitizeObj(item, maxLen));

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = sanitizeText(value, maxLen);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeObj(value, maxLen);
    } else {
      result[key] = value; // numbers, booleans, null — sin cambio
    }
  }
  return result;
}

// ── Validadores ───────────────────────────────────────────────────

/**
 * Resultados de validación tipificados.
 * @typedef {{ valid: boolean, error?: string }}
 */

export const Validators = {

  /**
   * Valida un email.
   * Usa la API nativa del browser como primera capa,
   * y el pattern regex como segunda capa más estricta.
   */
  email(value) {
    const str = sanitizeText(value, 254);
    if (!str) return { valid: false, error: 'El email es requerido.' };

    // Capa 1: API nativa del browser (solo disponible en entorno DOM)
    if (typeof document !== 'undefined') {
      const probe = document.createElement('input');
      probe.type  = 'email';
      probe.value = str;
      if (!probe.checkValidity()) {
        return { valid: false, error: 'Introduce un email válido.' };
      }
    }

    // Capa 2: regex RFC 5322 simplificado (funciona en Node y browser)
    if (!PATTERNS.EMAIL.test(str)) {
      return { valid: false, error: 'Introduce un email válido.' };
    }

    return { valid: true };
  },

  /**
   * Valida una contraseña con reglas de complejidad.
   */
  password(value) {
    if (!value) return { valid: false, error: 'La contraseña es requerida.' };
    if (value.length < 8) return { valid: false, error: 'Mínimo 8 caracteres.' };
    if (value.length > 128) return { valid: false, error: 'Máximo 128 caracteres.' };
    if (!/[A-Z]/.test(value)) return { valid: false, error: 'Incluye al menos una mayúscula.' };
    if (!/[0-9]/.test(value)) return { valid: false, error: 'Incluye al menos un número.' };
    return { valid: true };
  },

  /**
   * Valida el nombre de un hábito.
   */
  habitName(value) {
    const str = sanitizeText(value, 48);
    if (!str) return { valid: false, error: 'El nombre del hábito es requerido.' };
    if (str.length < 2) return { valid: false, error: 'Mínimo 2 caracteres.' };
    return { valid: true };
  },

  /**
   * Valida la nota de un hábito.
   */
  habitNote(value) {
    const str = sanitizeNote(value);
    if (str.length > 80) return { valid: false, error: 'Máximo 80 caracteres.' };
    if (/<|>/.test(str)) return { valid: false, error: 'La nota no puede contener HTML.' };
    return { valid: true };
  },

  /**
   * Valida un ID de hábito.
   */
  habitId(value) {
    if (!value || !PATTERNS.HABIT_ID.test(value)) {
      return { valid: false, error: 'ID de hábito inválido.' };
    }
    return { valid: true };
  },
};
