/**
 * KIP · CommandPalette
 * Paleta de comandos modal activada con ⌘K / Ctrl+K o btn-cmd.
 *
 * [B-21] btn-cmd no tenía handler de click — el atajo ⌘K llamaba a
 *        btn-cmd.click() pero nadie escuchaba ese click para abrir la paleta.
 * [B-22] cmd-input no filtraba los cmd-item al escribir.
 * [B-23] cmd-backdrop no cerraba la paleta.
 * [B-24] data-cmd="new-habit/settings/theme" no tenían handlers.
 */
export const CommandPalette = {
  _controller: null,
  _themeManager: null,

  /**
   * @param {{ themeManager?: object }} opts
   */
  init({ themeManager } = {}) {
    const palette  = document.getElementById('cmd-palette');
    const backdrop = document.getElementById('cmd-backdrop');
    const input    = document.getElementById('cmd-input');
    const btnOpen  = document.getElementById('btn-cmd');
    if (!palette) return;

    this._themeManager = themeManager ?? null;

    this._controller?.abort();
    this._controller = new AbortController();
    const { signal } = this._controller;

    // ── Open / Close ──────────────────────────────────────────────
    const open = () => {
      palette.hidden = false;
      input?.focus();
      input && (input.value = '');
      this._filter('');
    };

    const close = () => {
      palette.hidden = true;
      input && (input.value = '');
    };

    // [B-21] btn-cmd abre la paleta
    btnOpen?.addEventListener('click', open, { signal });

    // [B-23] Backdrop cierra la paleta
    backdrop?.addEventListener('click', close, { signal });

    // Escape cierra
    palette.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    }, { signal });

    // ── [B-22] Filtrado al escribir ───────────────────────────────
    input?.addEventListener('input', () => this._filter(input.value), { signal });

    // Navegar con flechas y Enter
    input?.addEventListener('keydown', (e) => {
      const items = [...palette.querySelectorAll('.cmd-item:not([hidden])')];
      const active = palette.querySelector('.cmd-item--active');
      const idx = items.indexOf(active);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        active?.classList.remove('cmd-item--active');
        (items[idx + 1] || items[0])?.classList.add('cmd-item--active');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        active?.classList.remove('cmd-item--active');
        (items[idx - 1] || items[items.length - 1])?.classList.add('cmd-item--active');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = palette.querySelector('.cmd-item--active') || items[0];
        if (target) { target.click(); close(); }
      }
    }, { signal });

    // ── [B-24] Acciones data-cmd ──────────────────────────────────
    palette.addEventListener('click', (e) => {
      const item = e.target.closest('[data-cmd]');
      if (item) {
        close();
        this._runCmd(item.dataset.cmd);
        return;
      }
      // Links de navegación (href) — dejar que el browser los siga
      const link = e.target.closest('a.cmd-item[href]');
      if (link) close();
    }, { signal });
  },

  /** Filtra los cmd-item según el texto de búsqueda. */
  _filter(query) {
    const q = query.toLowerCase().trim();
    const palette = document.getElementById('cmd-palette');
    if (!palette) return;

    let firstVisible = null;
    palette.querySelectorAll('.cmd-item').forEach(item => {
      const text = item.textContent.toLowerCase();
      const show = !q || text.includes(q);
      item.hidden = !show;
      item.classList.remove('cmd-item--active');
      if (show && !firstVisible) firstVisible = item;
    });

    // Ocultar section-labels si no tienen items visibles debajo
    palette.querySelectorAll('.cmd-section-label').forEach(label => {
      let next = label.nextElementSibling;
      let hasVisible = false;
      while (next && !next.classList.contains('cmd-section-label')) {
        if (!next.hidden) hasVisible = true;
        next = next.nextElementSibling;
      }
      label.hidden = !hasVisible;
    });

    firstVisible?.classList.add('cmd-item--active');
  },

  /** Ejecuta una acción de la paleta. */
  _runCmd(cmd) {
    switch (cmd) {
      case 'new-habit':
        document.getElementById('btn-nuevo-habito')?.click();
        break;
      case 'settings':
        document.getElementById('btn-account')?.click();      // abrir dropdown
        // dar un tick para que el dropdown aparezca, luego simular click en settings
        setTimeout(() => {
          document.querySelector('[data-account-action="settings"]')?.click();
        }, 50);
        break;
      case 'theme': {
        // Abrir el switcher de tema flotante si existe
        const themeSw = document.querySelector('.theme-sw');
        if (themeSw) {
          themeSw.classList.remove('theme-sw--hidden');
        } else {
          // Fallback: ir directo al panel de configuración sección preferencias
          document.querySelector('[data-account-action="settings"]')?.click();
          setTimeout(() => {
            document.querySelector('[data-settings-section="preferencias"]')?.click();
          }, 100);
        }
        break;
      }
      default:
        console.warn('[CommandPalette] Acción desconocida:', cmd);
    }
  },

  destroy() {
    this._controller?.abort();
    this._controller = null;
  },
};
