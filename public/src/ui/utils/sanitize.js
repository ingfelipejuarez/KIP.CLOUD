/**
 * KIP · src/ui/utils/sanitize.js
 *
 * Utilidades de sanitización de strings para prevenir XSS.
 * Nunca interpolar datos externos en innerHTML sin pasar por esc().
 *
 * Corrección: [C-02] XSS en achievements.js y cualquier template literal con datos del servidor.
 */

/**
 * Escapa caracteres HTML especiales en un string.
 * Usar SIEMPRE antes de interpolar datos externos en innerHTML o template literals.
 *
 * @param {unknown} value — cualquier valor; se convierte a string antes de escapar.
 * @returns {string} string seguro para insertar en HTML.
 *
 * @example
 * div.innerHTML = `<span>${esc(badge.nombre)}</span>`;
 */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

/**
 * Sanitiza un string eliminando etiquetas HTML por completo.
 * Útil para textos que deben mostrarse como texto plano (nombres, notas).
 *
 * @param {unknown} value
 * @returns {string}
 */
export function stripTags(value) {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}
