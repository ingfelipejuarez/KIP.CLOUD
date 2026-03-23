import { KIP_EVENTS } from '../../events.js';
/** KIP · HabitContextMenu — menú contextual de hábitos
 *
 * [FIX-8] Añadido guard _initialized con AbortController.
 * [FIX-8b] _habitoId movido a closure local en lugar de propiedad
 *          del objeto, eliminando la race condition si dos menús
 *          intentan abrirse en el mismo tick.
 */
export const HabitContextMenuComponent = {
  _controller: null,

  init() {
    const menu = document.getElementById('ctx-menu');
    if (!menu) return;

    // [FIX-8] Limpiar listeners anteriores antes de registrar nuevos
    this.destroy();
    this._controller = new AbortController();
    const { signal } = this._controller;

    // [FIX-8b] habitoId como variable de closure — no como propiedad compartida
    // del objeto, evitando race conditions si el menú se abre muy rápido.
    let _habitoId = null;

    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-ctx-trigger]');
      if (trigger) {
        const card = trigger.closest('[data-habito-id]');
        _habitoId = card?.dataset.habitoId ?? null;
        const r = trigger.getBoundingClientRect();
        menu.style.cssText = `position:fixed;top:${r.bottom + 4}px;right:${window.innerWidth - r.right}px`;
        menu.hidden = false;
        e.stopPropagation();
        return;
      }
      if (!menu.contains(e.target)) menu.hidden = true;
    }, { signal });

    document.getElementById('ctx-edit')?.addEventListener('click', () => {
      menu.hidden = true;
      window.dispatchEvent(new CustomEvent(KIP_EVENTS.CTX_EDIT, { detail: { id: _habitoId } }));
    }, { signal });

    document.getElementById('ctx-archive')?.addEventListener('click', () => {
      menu.hidden = true;
      window.dispatchEvent(new CustomEvent(KIP_EVENTS.CTX_ARCHIVE, { detail: { id: _habitoId } }));
    }, { signal });

    document.getElementById('ctx-delete')?.addEventListener('click', () => {
      menu.hidden = true;
      window.dispatchEvent(new CustomEvent(KIP_EVENTS.CTX_DELETE, { detail: { id: _habitoId } }));
    }, { signal });
  },

  /** Elimina todos los listeners registrados por este componente. */
  destroy() {
    this._controller?.abort();
    this._controller = null;
  },
};
