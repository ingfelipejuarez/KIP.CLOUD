/**
 * KIP · ConfirmDialog
 * Utilidad promise-based para el diálogo de confirmación global.
 *
 * [B-32] confirm-cancel y confirm-ok no tenían handlers — el diálogo
 *        existía en el HTML de todas las páginas pero era completamente inerte.
 *
 * Uso:
 *   const ok = await ConfirmDialog.show({ title: '¿Eliminar?', desc: 'No se puede deshacer.' });
 *   if (ok) { ... }
 *
 * Si el diálogo no existe en el DOM (página sin él), devuelve true por defecto
 * para no bloquear flujos que dependan de la confirmación.
 */
export const ConfirmDialog = {
  _resolve: null,

  /**
   * Muestra el diálogo y retorna una Promise que resuelve con true (ok) o false (cancel).
   * @param {{ title?: string, desc?: string }} opts
   * @returns {Promise<boolean>}
   */
  show({ title = '¿Confirmar acción?', desc = 'Esta acción no se puede deshacer.' } = {}) {
    const dialog   = document.getElementById('confirm-dialog');
    const backdrop = document.getElementById('confirm-backdrop');

    // Fallback: si el diálogo no existe en este HTML, devolver true sin bloquear
    if (!dialog) return Promise.resolve(true);

    // Actualizar textos dinámicamente si se pasan
    const titleEl = document.getElementById('confirm-title');
    const descEl  = document.getElementById('confirm-desc');
    if (titleEl) titleEl.textContent = title;
    if (descEl)  descEl.textContent  = desc;

    // Mostrar
    dialog.hidden   = false;
    if (backdrop) backdrop.hidden = false;

    // Resolver cualquier promesa pendiente anterior (seguridad)
    this._resolve?.(false);

    return new Promise((resolve) => {
      this._resolve = resolve;
    });
  },

  /**
   * Inicializa los listeners de los botones. Llamar una sola vez desde bootstrap.
   * Usa AbortController para evitar duplicados si se llama más de una vez.
   */
  init() {
    const dialog   = document.getElementById('confirm-dialog');
    const backdrop = document.getElementById('confirm-backdrop');
    if (!dialog) return;

    this._controller?.abort();
    this._controller = new AbortController();
    const { signal } = this._controller;

    const resolve = (value) => {
      dialog.hidden = true;
      if (backdrop) backdrop.hidden = true;
      this._resolve?.(value);
      this._resolve = null;
    };

    document.getElementById('confirm-ok')?.addEventListener('click', () => resolve(true), { signal });
    document.getElementById('confirm-cancel')?.addEventListener('click', () => resolve(false), { signal });
    backdrop?.addEventListener('click', () => resolve(false), { signal });
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') resolve(false);
      if (e.key === 'Enter')  resolve(true);
    }, { signal });
  },

  destroy() {
    this._controller?.abort();
    this._controller = null;
    this._resolve?.(false);
    this._resolve = null;
  },
};
