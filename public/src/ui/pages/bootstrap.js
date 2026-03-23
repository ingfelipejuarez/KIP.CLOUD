/**
 * KIP · src/ui/pages/bootstrap.js
 *
 * Inicializador compartido para TODAS las páginas.
 * Usa imports ESTÁTICOS — más confiables que los dinámicos en entornos de desarrollo.
 * Si un import estático falla, el error es visible inmediatamente en la consola.
 */

import { KIPStore }               from '../../services/KIPStore.js';
import { AccountComponent }       from '../components/composed/AccountComponent.js';
import { CommandPalette }         from '../components/composed/CommandPalette.js';
import { SettingsPanel }          from '../components/composed/SettingsPanel.js';
import { ConfirmDialog }          from '../components/composed/ConfirmDialog.js';
import { NavbarScrollComponent }  from '../components/composed/NavbarScroll.js';
import { SoundFeedbackComponent } from '../components/composed/SoundFeedback.js';
import { ThemeSwitcherComponent } from '../components/composed/ThemeSwitcher.js';
import { ThemeManager }           from '../../services/ThemeManager.js';
import { KIP_EVENTS }             from '../events.js';
// [FIX-BUG2] HabitModalComponent se inicializa aquí en bootstrap para que
// el botón "Nuevo Hábito" (#btn-nuevo-habito y #btn-nuevo-habito-2) responda
// al click en TODAS las páginas que tengan el modal, sin depender de que
// authGuard() retorne true ni de que el módulo de página llegue a ejecutarse.
import { HabitModalComponent }    from '../components/composed/HabitModal.js';
import { MobileNavComponent }     from '../components/composed/MobileNav.js';
import { KeyboardShortcutsComponent } from '../components/composed/KeyboardShortcuts.js';

// Exponer KIPStore globalmente para módulos que lo necesiten via window
window.KIPStore = KIPStore;

// ── Fuentes Google (reemplaza onload= bloqueado por CSP) ───────────
function loadFontsLazy() {
  const fonts = [
    'https://fonts.googleapis.com/css2?family=Syne:wght@600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500&display=swap',
    'https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&display=swap',
  ];
  fonts.forEach(href => {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  });
}

// ── Keyboard shortcuts ─────────────────────────────────────────────
function initKeyboardShortcuts() {
  const SHORTCUTS = {
    'k':      () => document.getElementById('btn-cmd')?.click(),
    'n':      () => document.getElementById('btn-nuevo-habito')?.click(),
    't':      () => {
      const sw = document.querySelector('.theme-sw');
      if (sw) sw.classList.toggle('theme-sw--hidden');
    },
    's':      () => document.getElementById('btn-sound')?.click(),
    '?':      () => document.getElementById('btn-shortcuts')?.click(),
    'd':      () => { window.location.href = '../../app/dashboard/'; },
    'h':      () => { window.location.href = '../../app/habits/'; },
    'a':      () => { window.location.href = '../../app/ai/'; },
    'Escape': () => {
      // [FIX-P09] Excluir #mobile-nav: MobileNav.js gestiona su propio Escape.
      // Sin esta exclusión, el handler global hacía click en .modal-close del
      // drawer simultáneamente con el listener de MobileNav → doble disparo.
      document.querySelectorAll('[role="dialog"]:not([hidden])').forEach(el => {
        if (el.id === 'mobile-nav') return;
        el.querySelector('.modal-close, [id*="close"], [id*="cancel"]')?.click();
      });
    },
  };
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag)) return;
    if (document.activeElement?.isContentEditable) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault(); SHORTCUTS['k']?.(); return;
    }
    if (!e.metaKey && !e.ctrlKey && !e.altKey) SHORTCUTS[e.key]?.();
  });
}

// ── Nav link activo ────────────────────────────────────────────────
function markActiveNavLink() {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-link').forEach(a => {
    const href = a.getAttribute('href') || '';
    const seg  = href.replace(/^\.+\/|\/$/g, '').split('/').pop();
    if (seg && path.includes(seg)) a.classList.add('nav-link--active');
  });
}

// ── Bootstrap principal ────────────────────────────────────────────
function boot() {
  // ── Reset defensivo inmediato ──────────────────────────────────
  // Se ejecuta síncronamente en boot(), ANTES de que cualquier módulo
  // de página cargue. Garantiza que ningún modal quede visible por
  // cache de CSS o estado residual del browser.
  [
    'habit-modal', 'modal-backdrop',
    'cmd-palette', 'cmd-backdrop',
    'confirm-dialog', 'confirm-backdrop',
    'settings-panel', 'settings-backdrop',
    'kbd-panel', 'kbd-backdrop',
    'onboarding-modal',
  ].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = true; });

  // [FIX] Asegurar que el mobile drawer empieza cerrado
  document.getElementById('mobile-nav')?.classList.remove('open');

  loadFontsLazy();
  NavbarScrollComponent.init();  // [FIX] Usa el componente centralizado — evita doble listener en dashboard
  initKeyboardShortcuts();
  markActiveNavLink();
  AccountComponent.init();

  // Sonido global — inicializar en bootstrap para que funcione en TODAS las páginas
  // dashboard.js y habits.js también llaman init() pero el AbortController evita duplicados
  SoundFeedbackComponent.init();
  window.SoundFeedbackComponent = SoundFeedbackComponent;

  // Tema global — inicializar en bootstrap para que sf-theme-btn funcione en TODAS las páginas
  // dashboard.js también crea su propia instancia pero ThemeSwitcherComponent.destroy() evita duplicados
  const _themeManager = ThemeManager.getInstance();
  _themeManager.cargarGuardado();
  new ThemeSwitcherComponent(_themeManager);

  // [FIX-P01] El handler del hamburger se gestiona en MobileNav.js
  // El handler anterior que abría la paleta se eliminó para evitar
  // que ambos se ejecuten simultáneamente.

  // ── Onboarding — mostrar en primer acceso ────────────────────
  _initOnboarding();

  // [B-21–B-24] Command Palette — abre con ⌘K y btn-cmd
  CommandPalette.init();

  // [B-25–B-31] Settings Panel — pestañas, toggles, guardar, exportar, eliminar
  SettingsPanel.init();

  // [B-32] Confirm Dialog — wiring de confirm-ok / confirm-cancel
  ConfirmDialog.init();

  // [FIX-BUG2] HabitModal — registrar listeners de los botones "Nuevo Hábito"
  // ANTES de que el módulo de página cargue, de modo que el botón responde
  // aunque authGuard falle o el módulo tarde en inicializarse.
  // HabitModalComponent.init() usa AbortController, por lo que habits.js
  // puede llamarlo de nuevo sin duplicar listeners.
  HabitModalComponent.init();
  MobileNavComponent();   // [FIX] Drawer de navegación móvil — módulo externo, compatible con CSP
  // [FIX] Panel de atajos disponible en TODAS las páginas, no solo en dashboard.js
  KeyboardShortcutsComponent.init();

  // Escuchar kip:ready para actualizar el store con datos del usuario
  window.addEventListener(KIP_EVENTS.READY, (e) => {
    const { authService, habitos } = e.detail || {};
    if (!authService) return;
    const usuario = authService.getUsuario?.();
    if (!usuario) return;
    // [FIX] Guard defensivo: KIPStore puede no estar disponible si el módulo
    // falló parcialmente (error de red, CSP, etc.). Usar window.KIPStore como
    // fallback ya que bootstrap.js lo expone globalmente al inicio.
    const store = (typeof KIPStore !== 'undefined' ? KIPStore : window.KIPStore)?.getInstance?.();
    if (!store) return;
    store.setState({
      usuario,
      habitos: habitos || [],
      plan:    usuario.plan || 'FREE',
      nombre:  usuario.nombre || '',
    });
    AccountComponent._renderUserData(store.getState());
  });

  // Señal: los módulos de página pueden arrancar
  window.__kipLayoutsReady = true;
  window.dispatchEvent(new CustomEvent(KIP_EVENTS.LAYOUTS_LOADED));

  // Cerrar theme-sw al hacer clic fuera
  document.addEventListener('click', (e) => {
    const sw = document.querySelector('.theme-sw');
    if (sw && !sw.contains(e.target) && !sw.classList.contains('theme-sw--hidden')) {
      sw.classList.add('theme-sw--hidden');
    }
  });

  console.log('%c KIP v6.0 PATCHED ✓ ', 'background:#10B981;color:#fff;font-weight:bold;border-radius:4px;padding:2px 6px');
  console.debug('[bootstrap] listo ✓');
}

// ── Onboarding — primer acceso ────────────────────────────────────
function _initOnboarding() {
  const modal    = document.getElementById('onboarding-modal');
  const backdrop = document.getElementById('onboarding-backdrop');
  if (!modal) return;

  // Mostrar solo en el primer acceso (localStorage flag)
  let seen = false;
  try { seen = !!localStorage.getItem('kip_onboarding_seen'); } catch (_) {}
  if (seen) return;

  // Mostrar tras un pequeño delay para no bloquear el primer render
  setTimeout(() => {
    modal.hidden   = false;
    if (backdrop) backdrop.hidden = false;
  }, 600);

  const steps  = modal.querySelectorAll('.onboarding-step');
  const dots   = modal.querySelectorAll('.onboarding-dot');
  let current  = 0;

  const goTo = (idx) => {
    steps.forEach((s, i) => { s.hidden = i !== idx; });
    dots.forEach((d, i) => d.classList.toggle('onboarding-dot--active', i === idx));
    current = idx;
  };

  const close = () => {
    modal.hidden = true;
    if (backdrop) backdrop.hidden = true;
    try { localStorage.setItem('kip_onboarding_seen', '1'); } catch (_) {}
  };

  // Botones de navegación
  modal.querySelector('#onboarding-next-0')?.addEventListener('click', () => goTo(1));
  modal.querySelector('#onboarding-next-1')?.addEventListener('click', () => goTo(2));
  modal.querySelector('#onboarding-next-2')?.addEventListener('click', () => {
    close();
    // Abrir el modal de nuevo hábito directamente al cerrar onboarding
    setTimeout(() => document.getElementById('btn-nuevo-habito')?.click(), 200);
  });

  // Sugerencias rápidas — prerellenan el modal de hábito y lo abren
  modal.querySelectorAll('.onboarding-sug').forEach(btn => {
    btn.addEventListener('click', () => {
      close();
      // Pre-rellenar el campo nombre del modal de hábito
      setTimeout(() => {
        document.getElementById('btn-nuevo-habito')?.click();
        setTimeout(() => {
          const nombreEl = document.getElementById('mf-nombre');
          const catBtns  = document.querySelectorAll('.mf-cat-btn');
          if (nombreEl) nombreEl.value = btn.dataset.sug || '';
          // Seleccionar la categoría correspondiente
          const cat = btn.dataset.cat;
          if (cat) {
            catBtns.forEach(b => {
              b.classList.toggle('active', b.dataset.cat === cat);
            });
          }
        }, 120);
      }, 200);
    });
  });

  // Cerrar con backdrop
  backdrop?.addEventListener('click', close);
  modal.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

// Arrancar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
