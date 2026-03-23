/**
 * KIP · SettingsPanel
 * Panel de configuración lateral completamente funcional.
 *
 * [B-25] btn-close-settings no tenía handler.
 * [B-26] settings-backdrop no cerraba el panel.
 * [B-27] Tabs .settings-tab no cambiaban de sección.
 * [B-28] btn-save-general no guardaba nombre ni idioma.
 * [B-29] Toggles de preferencias (recordatorios, animaciones, sonido,
 *        confetti, enfoque) no tenían handler ni persistencia.
 * [B-30] btn-export-data no hacía nada.
 * [B-31] Flujo de eliminar cuenta incompleto.
 */
import { KIP_CONFIG }   from '../../../config.js';
import { TokenService } from '../../../services/TokenService.js';
import { KIPStore }     from '../../../services/KIPStore.js';
import { ThemeManager } from '../../../services/ThemeManager.js';

// Claves de localStorage para preferencias
const PREF_KEYS = {
  recordatorios: 'kip_notif_enabled',
  notifHora:     'kip_notif_hora',
  animaciones:   'kip_animaciones',
  sonido:        KIP_CONFIG.KEYS.SOUND,
  confetti:      'kip_confetti',
  enfoque:       'kip_enfoque',
};

export const SettingsPanel = {
  _controller: null,

  init() {
    const panel    = document.getElementById('settings-panel');
    const backdrop = document.getElementById('settings-backdrop');
    if (!panel) return;

    this._controller?.abort();
    this._controller = new AbortController();
    const { signal } = this._controller;

    // ── [B-25 / B-26] Abrir / cerrar ────────────────────────────
    const open = () => {
      panel.hidden    = false;
      if (backdrop) backdrop.hidden = false;
      this._populateGeneral();
      this._populatePrefs();
    };
    const close = () => {
      panel.hidden    = true;
      if (backdrop) backdrop.hidden = true;
    };

    document.getElementById('btn-close-settings')?.addEventListener('click', close, { signal });
    backdrop?.addEventListener('click', close, { signal });
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }, { signal });

    // ── [B-27] Tabs ───────────────────────────────────────────────
    panel.querySelectorAll('.settings-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        // Desactivar todos
        panel.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        panel.querySelectorAll('.settings-section').forEach(s => s.hidden = true);

        // Activar seleccionado
        tab.classList.add('active');
        const targetId = `settings-${tab.dataset.settingsSection}`;
        const section  = document.getElementById(targetId);
        if (section) section.hidden = false;
      }, { signal });
    });

    // ── [B-28] Guardar general ────────────────────────────────────
    document.getElementById('btn-save-general')?.addEventListener('click', () => {
      const nombre = document.getElementById('sf-nombre')?.value.trim();
      const idioma = document.getElementById('sf-idioma')?.value || 'es';

      if (nombre) {
        // Persistir en localStorage
        try { localStorage.setItem(KIP_CONFIG.KEYS.NOMBRE, nombre); } catch (_) {}

        // Actualizar el elemento del header directamente (sin mutar el store)
        const headerEl = document.getElementById('nombre-usuario');
        if (headerEl) headerEl.textContent = nombre;

        // Actualizar el store de forma INMUTABLE y MÍNIMA:
        // solo cambiar nombre y usuario.nombre sin tocar el resto del estado.
        // NO usar { ...store.getState() } porque propagaría todo el estado
        // y si usuario es null en este momento borraría los datos ya cargados.
        const store = KIPStore.getInstance?.();
        if (store) {
          const current = store.getState();
          // Crear un nuevo objeto usuario con el nombre actualizado,
          // sin mutar el objeto original (inmutabilidad).
          const usuarioActualizado = current.usuario
            ? { ...current.usuario, nombre }
            : null; // si aún no hay usuario, no crear uno falso
          store.setState({
            nombre, // campo plano de nombre para el dropdown
            ...(usuarioActualizado ? { usuario: usuarioActualizado } : {}),
          });
        }
      }

      try { localStorage.setItem('kip_idioma', idioma); } catch (_) {}

      // Feedback visual en el botón
      const btn = document.getElementById('btn-save-general');
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = '✓ Guardado';
        btn.disabled = true;
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
      }
    }, { signal });

    // ── [B-29] Toggles de preferencias ───────────────────────────
    const toggleMap = {
      'toggle-recordatorios': { key: PREF_KEYS.recordatorios, default: true,  onChange: (v) => this._onRecordatoriosChange(v) },
      'toggle-animaciones':   { key: PREF_KEYS.animaciones,   default: true,  onChange: (v) => this._onAnimacionesChange(v)   },
      'toggle-sonido-pref':   { key: PREF_KEYS.sonido,        default: true,  onChange: (v) => this._onSonidoChange(v)        },
      'toggle-confetti':      { key: PREF_KEYS.confetti,      default: true,  onChange: null                                  },
      'toggle-enfoque':       { key: PREF_KEYS.enfoque,       default: false, onChange: (v) => this._onEnfoqueChange(v)       },
    };

    Object.entries(toggleMap).forEach(([id, cfg]) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('click', () => {
        const isActive = btn.classList.toggle('active');
        btn.setAttribute('aria-checked', String(isActive));
        try { localStorage.setItem(cfg.key, isActive ? 'on' : 'off'); } catch (_) {}
        cfg.onChange?.(isActive);
      }, { signal });
    });

    // Toggle de recordatorios — mostrar/ocultar hora
    document.getElementById('toggle-recordatorios')?.addEventListener('click', () => {
      const on     = document.getElementById('toggle-recordatorios')?.classList.contains('active');
      const horaGr = document.getElementById('notif-hora-group');
      if (horaGr) horaGr.hidden = !on;
    }, { signal });

    // Guardar hora de notificación
    document.getElementById('sf-hora-notif')?.addEventListener('change', (e) => {
      try { localStorage.setItem(PREF_KEYS.notifHora, e.target.value); } catch (_) {}
    }, { signal });

    // ── [B-30] Exportar datos ─────────────────────────────────────
    document.getElementById('btn-export-data')?.addEventListener('click', () => {
      this._exportData();
    }, { signal });

    // ── [B-31] Eliminar cuenta ────────────────────────────────────
    document.getElementById('btn-delete-account')?.addEventListener('click', () => {
      const confirmDiv = document.getElementById('delete-confirm');
      if (confirmDiv) confirmDiv.hidden = false;
      document.getElementById('delete-confirm-input')?.focus();
    }, { signal });

    document.getElementById('btn-delete-cancel')?.addEventListener('click', () => {
      const confirmDiv = document.getElementById('delete-confirm');
      if (confirmDiv) confirmDiv.hidden = true;
      const input = document.getElementById('delete-confirm-input');
      if (input) input.value = '';
      const confirmBtn = document.getElementById('btn-delete-confirm');
      if (confirmBtn) confirmBtn.disabled = true;
    }, { signal });

    document.getElementById('delete-confirm-input')?.addEventListener('input', (e) => {
      const confirmBtn = document.getElementById('btn-delete-confirm');
      if (confirmBtn) confirmBtn.disabled = e.target.value.trim() !== 'ELIMINAR';
    }, { signal });

    document.getElementById('btn-delete-confirm')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-delete-confirm');
      if (btn) { btn.disabled = true; btn.textContent = 'Eliminando…'; }
      try {
        // Limpiar todos los datos locales
        const keys = Object.keys(localStorage).filter(k => k.startsWith('kip'));
        keys.forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
        try { sessionStorage.clear(); } catch (_) {}
        // Revocar sesión y redirigir al login
        await TokenService.revoke();
        window.location.replace('../../app/login/');
      } catch {
        if (btn) { btn.disabled = false; btn.textContent = 'Eliminar'; }
      }
    }, { signal });

    // Exponer open() para que AccountComponent lo pueda llamar sin abrir settings directamente
    this._openFn = open;
  },

  /** Rellena los campos del tab General con datos actuales. */
  _populateGeneral() {
    const store   = KIPStore.getInstance?.();
    const state   = store?.getState() || {};
    const usuario = state.usuario || {};

    const nombreEl = document.getElementById('sf-nombre');
    const emailEl  = document.getElementById('sf-email');

    if (nombreEl) {
      nombreEl.value = usuario.nombre
        || (() => { try { return localStorage.getItem(KIP_CONFIG.KEYS.NOMBRE) || ''; } catch { return ''; } })();
    }
    if (emailEl) emailEl.value = usuario.email || '';
  },

  /** Sincroniza el estado visual de los toggles con localStorage. */
  _populatePrefs() {
    const read = (key, def) => {
      try { const v = localStorage.getItem(key); return v === null ? def : v === 'on'; } catch { return def; }
    };
    const setToggle = (id, active) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-checked', String(active));
    };
    setToggle('toggle-recordatorios', read(PREF_KEYS.recordatorios, true));
    setToggle('toggle-animaciones',   read(PREF_KEYS.animaciones,   true));
    setToggle('toggle-sonido-pref',   read(PREF_KEYS.sonido,        true));
    setToggle('toggle-confetti',      read(PREF_KEYS.confetti,      true));
    setToggle('toggle-enfoque',       read(PREF_KEYS.enfoque,       false));

    // Hora de notificación
    const hora = (() => { try { return localStorage.getItem(PREF_KEYS.notifHora) || '08:00'; } catch { return '08:00'; } })();
    const horaEl = document.getElementById('sf-hora-notif');
    if (horaEl) horaEl.value = hora;

    // Mostrar/ocultar grupo de hora según estado del toggle
    const notifOn    = read(PREF_KEYS.recordatorios, true);
    const horaGroup  = document.getElementById('notif-hora-group');
    if (horaGroup) horaGroup.hidden = !notifOn;

    // Sincronizar y cablear la grid de temas
    const tm = ThemeManager.getInstance();
    const temaActual = tm.getTemaActual?.() || document.documentElement.getAttribute('data-theme') || 'ember';
    document.querySelectorAll('.sf-theme-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === temaActual);
      // [FIX] Añadir listener de clic aquí como respaldo —
      // ThemeSwitcherComponent puede no haberse inicializado en esta página.
      // { once: false } pero sin AbortController individual: re-asignar en cada apertura
      // es seguro porque ThemeSwitcher ya limpia listeners con AbortController.
      // Para evitar duplicados: clonar el nodo y reemplazarlo (limpia todos sus listeners).
      const fresh = b.cloneNode(true);
      b.parentNode?.replaceChild(fresh, b);
      fresh.addEventListener('click', () => {
        tm.aplicar(fresh.dataset.theme);
        document.querySelectorAll('.sf-theme-btn, .theme-sw-btn').forEach(x =>
          x.classList.toggle('active', x.dataset.theme === fresh.dataset.theme)
        );
      });
    });
  },

  /** Genera un JSON con todos los datos del usuario y lo descarga. */
  _exportData() {
    try {
      const habitos = (() => { try { return JSON.parse(localStorage.getItem('kip_habitos') || '[]'); } catch { return []; } })();
      const nombre  = (() => { try { return localStorage.getItem(KIP_CONFIG.KEYS.NOMBRE) || ''; } catch { return ''; } })();
      const tema    = (() => { try { return localStorage.getItem(KIP_CONFIG.KEYS.TEMA) || 'ember'; } catch { return 'ember'; } })();

      const payload = {
        exportado:   new Date().toISOString(),
        version:     KIP_CONFIG.VERSION,
        usuario:     { nombre },
        preferencias:{ tema },
        habitos,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `kip-datos-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      console.error('[SettingsPanel] exportData error:', err);
    }
  },

  /** Efectos secundarios de los toggles */
  _onSonidoChange(active) {
    // Sincronizar estado interno de SoundFeedbackComponent
    if (window.SoundFeedbackComponent) {
      window.SoundFeedbackComponent._enabled = active;
    }
    // Sincronizar también el icono SVG del botón #btn-sound en la navbar
    const on  = document.getElementById('icon-snd-on');
    const off = document.getElementById('icon-snd-off');
    if (on)  on.style.display  = active ? '' : 'none';
    if (off) off.style.display = active ? 'none' : '';
  },

  _onAnimacionesChange(active) {
    document.documentElement.setAttribute('data-animaciones', active ? 'on' : 'off');
  },

  _onEnfoqueChange(active) {
    document.body.classList.toggle('focus-mode', active);
  },

  _onRecordatoriosChange(_active) {
    // Aquí iría la lógica de Notification API en una versión futura
  },

  open() { this._openFn?.(); },

  destroy() {
    this._controller?.abort();
    this._controller = null;
  },
};
