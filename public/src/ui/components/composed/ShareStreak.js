/**
 * KIP · ShareStreak — botón compartir racha.
 * Versión simplificada: usa Web Share API en móvil, copia al portapapeles en desktop.
 */
import { ToastComponent } from '../primitives/Toast.js';

export const ShareStreakComponent = {
  _controller: null,

  init({ racha = 0, nombre = '', completados = 0, total = 0 } = {}) {
    const btn = document.getElementById('btn-share-streak');
    if (!btn) return;

    this._controller?.abort();
    this._controller = new AbortController();
    const { signal } = this._controller;

    const text = `🔥 ¡${racha} días de racha en KIP! Completé ${completados}/${total} hábitos hoy. #KIP #Hábitos`;
    const url  = 'https://kip.app';

    btn.addEventListener('click', async () => {
      if (navigator.share) {
        try {
          await navigator.share({ title: 'Mi racha en KIP', text, url });
        } catch (_) {}
        return;
      }
      try {
        await navigator.clipboard.writeText(`${text} ${url}`);
        ToastComponent.show('✓ Copiado al portapapeles', 'ok');
      } catch {
        const ta = document.createElement('textarea');
        ta.value = `${text} ${url}`;
        ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        ToastComponent.show('✓ Copiado al portapapeles', 'ok');
      }
    }, { signal });
  },

  destroy() {
    this._controller?.abort();
    this._controller = null;
  },

  /** Alias de compatibilidad */
  compartir(opts) { this.init(opts); },
};
