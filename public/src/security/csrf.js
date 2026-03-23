/**
 * KIP · src/security/csrf.js
 * ─────────────────────────────────────────────────────────────────
 * Protección CSRF mediante el patrón "Double Submit Cookie".
 *
 * Cómo funciona:
 *   1. El servidor emite una cookie kip_csrf=<token> (NO httpOnly)
 *      en la respuesta del login.
 *   2. En cada request que muta estado (POST/PUT/PATCH/DELETE),
 *      el cliente lee esa cookie y la reenvía en el header X-CSRF-Token.
 *   3. El servidor verifica que el valor del header coincida con la cookie.
 *   4. Un atacante en otro dominio puede enviar el header X-CSRF-Token
 *      pero NO puede leer las cookies de kip.app (Same-Origin Policy),
 *      por lo que no puede obtener el valor correcto → ataque bloqueado.
 *
 * Complemento del ApiClient — este módulo provee utilidades adicionales:
 *   - Inyección automática de tokens en formularios HTML (si los hubiera)
 *   - Verificación de origen en requests entrantes (para SW/workers)
 *   - Generación de tokens para modo mock/desarrollo
 */

// ── Generación de token para modo mock ────────────────────────────

/**
 * Genera un token CSRF criptográficamente seguro para el modo mock.
 * En producción el servidor genera y emite el token; este método
 * solo sirve para inicializar el entorno de desarrollo.
 * @returns {string} token hexadecimal de 32 bytes
 */
export function generateCsrfToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Inicializa el token CSRF en cookie para el modo mock/desarrollo.
 * En producción, el servidor lo hace en la respuesta del login.
 */
export function initMockCsrfToken() {
  // Solo en modo desarrollo — no correr en producción
  if (document.cookie.includes('kip_csrf=')) return; // ya existe

  const token = generateCsrfToken();
  // Cookie accesible desde JS (NO httpOnly) — el cliente la lee para el header
  // SameSite=Strict evita que se envíe en navegación cross-site
  // [B-16] Los browsers rechazan cookies con flag `Secure` en http://localhost.
  //        Si se incluye Secure en desarrollo, la cookie nunca se establece
  //        y el header X-CSRF-Token queda siempre vacío en mock.
  const isSecureContext = location.protocol === 'https:';
  const cookieParts = [
    `kip_csrf=${token}`,
    `Path=/`,
    `SameSite=Strict`,
    `Max-Age=${60 * 60 * 24}`, // 24 horas
  ];
  if (isSecureContext) cookieParts.push('Secure'); // solo en HTTPS
  document.cookie = cookieParts.join('; ');

  return token;
}

// ── Lectura del token ─────────────────────────────────────────────

/**
 * Lee el token CSRF de las cookies.
 * @returns {string} el token, o cadena vacía si no existe
 */
export function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)kip_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

// ── Inyección en formularios HTML ────────────────────────────────

/**
 * Inyecta el token CSRF en todos los formularios de la página
 * como campo hidden. Útil si se usan <form> HTML tradicionales.
 * (KIP usa eventos JS, no <form>, pero se incluye por completitud.)
 */
export function injectCsrfInForms() {
  const token = getCsrfToken();
  if (!token) return;

  document.querySelectorAll('form[method="post"], form[method="POST"]').forEach(form => {
    // No duplicar si ya existe
    if (form.querySelector('input[name="csrf_token"]')) return;

    const input = document.createElement('input');
    input.type  = 'hidden';
    input.name  = 'csrf_token';
    input.value = token;
    form.prepend(input);
  });
}

// ── Verificación de origen (para Service Workers / fetch events) ──

/**
 * Verifica que un Request proviene del mismo origen.
 * Útil en Service Workers para no interceptar requests externos.
 * @param {Request} request
 * @returns {boolean}
 */
export function isSameOrigin(request) {
  try {
    const reqUrl = new URL(request.url);
    return reqUrl.origin === self.location.origin;
  } catch {
    return false;
  }
}

// ── Validación de URL de redirect ────────────────────────────────

/**
 * Valida que una URL de redirect es segura (no apunta a otro dominio).
 * Previene ataques de "Open Redirect".
 *
 * @param {string} url — URL o ruta a validar
 * @returns {string} la URL original si es segura, o '/' si no lo es
 */
export function safeRedirectUrl(url) {
  if (!url) return '/';
  try {
    // Si es una ruta relativa, es segura
    if (url.startsWith('/') && !url.startsWith('//')) return url;
    // Si es absoluta, verificar que sea el mismo origen
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin) return url;
    console.warn(`[CSRF] Redirect externo bloqueado: ${url}`);
    return '/';
  } catch {
    return '/';
  }
}
