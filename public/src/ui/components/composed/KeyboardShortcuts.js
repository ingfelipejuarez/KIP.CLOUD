/** KIP · KeyboardShortcuts — panel de atajos (ahora en bootstrap.js) */
export const KeyboardShortcutsComponent = {
  _controller: null,

  init(themeManager, opts = {}) {
    // Los atajos globales están en bootstrap.js.
    // Este componente solo inicializa el panel modal de atajos.
    const panel    = document.getElementById('kbd-panel');
    const backdrop = document.getElementById('kbd-backdrop');
    const btnOpen  = document.getElementById('btn-shortcuts');
    const btnClose = document.getElementById('btn-close-kbd');
    if (!panel) return;

    // [FIX-7] AbortController para evitar listeners duplicados si init() se llama más de una vez
    this._controller?.abort();
    this._controller = new AbortController();
    const { signal } = this._controller;

    const open  = () => { panel.hidden = false; if (backdrop) backdrop.hidden = false; };
    const close = () => { panel.hidden = true;  if (backdrop) backdrop.hidden = true; };

    btnOpen?.addEventListener('click',  open,  { signal });
    btnClose?.addEventListener('click', close, { signal });
    backdrop?.addEventListener('click', close, { signal });
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }, { signal });
  },

  destroy() {
    this._controller?.abort();
    this._controller = null;
  },
};
