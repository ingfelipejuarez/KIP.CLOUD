/**
 * KIP · AccountComponent — dropdown de cuenta de usuario.
 * Lógica restaurada de la versión funcional (kip.v6 original).
 * position:absolute relativo a .account-menu — sin JS de posicionamiento.
 * Visibilidad con atributo hidden nativo.
 */
import { KIPStore }     from '../../../services/KIPStore.js';
import { esc }          from '../../utils/sanitize.js';
import { SettingsPanel } from './SettingsPanel.js';
import { TokenService }  from '../../../services/TokenService.js';

export const AccountComponent = {
  _controller: null,
  _unsubscribeStore: null,

  init() {
    const btn  = document.getElementById('btn-account');
    const drop = document.getElementById('account-drop');
    if (!btn || !drop) return;

    // Limpiar listeners anteriores
    this._controller?.abort();
    this._controller = new AbortController();
    const { signal } = this._controller;

    // Estado inicial cerrado
    drop.hidden = true;
    btn.setAttribute('aria-expanded', 'false');

    // Poblar datos del usuario
    const store = KIPStore.getInstance();
    this._renderUserData(store.getState());
    this._unsubscribeStore?.();
    this._unsubscribeStore = store.subscribe(s => this._renderUserData(s));

    // Toggle al clic en el botón
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      drop.hidden ? this._open(btn, drop) : this._close();
    }, { signal });

    // Cerrar al clic fuera
    document.addEventListener('click', (e) => {
      if (!drop.hidden && !drop.contains(e.target) && e.target !== btn) {
        this._close();
      }
    }, { signal });

    // Cerrar con Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !drop.hidden) this._close();
    }, { signal });

    // Acciones del menú
    drop.addEventListener('click', (e) => {
      const item = e.target.closest('[data-account-action]');
      if (!item) return;
      this._close();
      this._handleAction(item.dataset.accountAction);
    }, { signal });
  },

  destroy() {
    this._controller?.abort();
    this._controller = null;
    this._unsubscribeStore?.();
    this._unsubscribeStore = null;
  },

  _open(btn, drop) {
    drop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  },

  _close() {
    const drop = document.getElementById('account-drop');
    const btn  = document.getElementById('btn-account');
    if (drop) drop.hidden = true;
    if (btn)  btn.setAttribute('aria-expanded', 'false');
  },

  _renderUserData(state) {
    if (!state?.usuario && !state?.nombre) return;
    const usuario  = state.usuario || {};
    const nombre   = esc(usuario.nombre || state.nombre || 'Usuario');
    const email    = esc(usuario.email  || '');
    const inicial  = nombre.charAt(0).toUpperCase() || 'U';
    const plan     = (state.plan || usuario.plan || 'FREE').toUpperCase();
    const planText = plan === 'PREMIUM' ? 'Plan Premium' : 'Plan Gratuito';

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('account-avatar',      inicial);
    set('account-drop-avatar', inicial);
    set('account-drop-name',   nombre);
    set('account-drop-email',  email);
    set('account-drop-plan',   planText);
  },

  _handleAction(action) {
    switch (action) {
      case 'settings': SettingsPanel.open(); break;
      case 'themes':
        document.querySelector('.theme-sw')?.classList.remove('theme-sw--hidden');
        break;
      case 'upgrade':
        window.location.href = '../../app/ai/';
        break;
      case 'logout':
        TokenService.revoke().finally(() => {
          window.location.replace('../../app/login/');
        });
        break;
    }
  },
};
