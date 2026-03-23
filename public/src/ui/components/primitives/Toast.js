/**
 * KIP · Toast — notificaciones transitorias
 */
export const ToastComponent = {
  _container: null,

  _getContainer() {
    if (!this._container) {
      this._container = document.getElementById('toast-root');
      if (!this._container) {
        this._container = document.createElement('div');
        this._container.id = 'toast-root';
        this._container.setAttribute('aria-live', 'polite');
        this._container.style.cssText =
          'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none';
        document.body.appendChild(this._container);
      }
    }
    return this._container;
  },

  show(message, type = 'ok', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.style.cssText =
      'background:var(--bg-3);border:1px solid var(--b-1);border-radius:var(--r-xl);' +
      'padding:10px 16px;font-size:13px;color:var(--tx-1);box-shadow:var(--sh-lg);' +
      'animation:toastIn .2s var(--e-spring);pointer-events:auto;max-width:320px;';
    toast.textContent = message; // textContent — nunca innerHTML

    if (type === 'err') toast.style.borderColor = 'rgba(239,68,68,.4)';
    if (type === 'ok')  toast.style.borderColor = 'var(--a-brd)';

    this._getContainer().appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity .2s';
      setTimeout(() => toast.remove(), 200);
    }, duration);
  },
};
