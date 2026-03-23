/** KIP · ThemeSwitcher — selector de tema */
export class ThemeSwitcherComponent {
  constructor(themeManager) {
    this._tm = themeManager;
    this._controller = null;
    this._init();
  }

  _init() {
    // [FIX-9] Limpiar listeners anteriores antes de registrar nuevos
    this._controller?.abort();
    this._controller = new AbortController();
    const { signal } = this._controller;

    const temaActual = this._tm?.getTemaActual?.()
      || document.documentElement.getAttribute('data-theme')
      || 'ember';

    document.querySelectorAll('[data-theme]').forEach(btn => {
      if (!btn.classList.contains('theme-sw-btn') &&
          !btn.classList.contains('sf-theme-btn')) return;
      btn.classList.toggle('active', btn.dataset.theme === temaActual);
      btn.addEventListener('click', () => {
        this._tm?.aplicar(btn.dataset.theme);
        document.querySelectorAll('[data-theme]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }, { signal });
    });
  }

  destroy() {
    this._controller?.abort();
    this._controller = null;
  }
}
