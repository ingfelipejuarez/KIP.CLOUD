/**
 * KIP · src/ui/events.js
 *
 * [FEAT-2] Contrato centralizado de todos los CustomEvents de KIP.
 *
 * Antes los nombres de eventos eran strings dispersos en el código.
 * Un typo en cualquier nombre ('kip:habito-creado' vs 'kip:habitoCreado')
 * fallaba silenciosamente — ninguna herramienta lo detectaba.
 *
 * Ahora: un único objeto frozen con todos los nombres. Si el string
 * cambia, se actualiza aquí y el error aparece en todos los usos.
 *
 * Uso — emitir:
 *   window.dispatchEvent(new CustomEvent(KIP_EVENTS.HABITO_CREADO, { detail: {...} }));
 *
 * Uso — escuchar:
 *   window.addEventListener(KIP_EVENTS.HABITO_CREADO, handler, { signal });
 */
export const KIP_EVENTS = Object.freeze({
  // ── Ciclo de vida del layout ────────────────────────────────────
  /** bootstrap.js emite este evento cuando el layout HTML está listo.
   *  Los módulos de página escuchan aquí para arrancar su launch(). */
  LAYOUTS_LOADED: 'kip:layouts-loaded',

  /** Los módulos de página emiten este evento cuando sus datos
   *  (authService, habitos, registros) están disponibles.
   *  bootstrap.js escucha aquí para actualizar AccountComponent. */
  READY: 'kip:ready',

  // ── Hábitos ────────────────────────────────────────────────────
  /** HabitModal emite cuando el usuario guarda un hábito nuevo. */
  HABITO_CREADO: 'kip:habito-creado',

  /** HabitContextMenu emite cuando el usuario elige "Editar". */
  HABITO_EDITADO: 'kip:habito-editado',

  // ── Menú contextual ────────────────────────────────────────────
  /** HabitContextMenu emite cuando el usuario elige "Editar" en el menú contextual. */
  CTX_EDIT: 'kip:ctx-edit',

  /** HabitContextMenu emite cuando el usuario elige "Archivar". */
  CTX_ARCHIVE: 'kip:ctx-archive',

  /** HabitContextMenu emite cuando el usuario elige "Eliminar". */
  CTX_DELETE: 'kip:ctx-delete',

  // ── Filtros ────────────────────────────────────────────────────
  /** CategoryFilter emite cuando el usuario cambia la categoría activa. */
  FILTER_CHANGED: 'kip:filter-changed',
});
