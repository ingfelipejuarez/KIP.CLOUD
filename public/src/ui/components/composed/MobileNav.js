/**
 * KIP · src/ui/components/composed/MobileNav.js
 *
 * Drawer de navegación para móvil.
 * Cargado como módulo ES desde bootstrap.js — sin scripts inline,
 * compatible con la CSP (script-src 'self').
 *
 * Requisitos HTML:
 *  - #mobile-nav         — el elemento raíz del drawer (.mobile-nav)
 *  - #btn-mobile-nav     — botón hamburger que abre el drawer
 *  - #btn-mobile-nav-close — botón × dentro del drawer
 *  - #mobile-nav-backdrop  — capa oscura que cierra al hacer clic
 *  - [data-mobile-link]  — anchors de navegación dentro del drawer
 */

export function MobileNavComponent() {
  const nav      = document.getElementById('mobile-nav');
  const btnOpen  = document.getElementById('btn-mobile-nav');
  const btnClose = document.getElementById('btn-mobile-nav-close');
  const backdrop = document.getElementById('mobile-nav-backdrop');

  if (!nav || !btnOpen) return;

  // ── Helpers ────────────────────────────────────────────────────
  function markActiveLink() {
    const path = window.location.pathname;
    nav.querySelectorAll('[data-mobile-link]').forEach(a => {
      // Normaliza "../habits/" → "/habits/" para comparar con pathname
      const href = a.getAttribute('href').replace(/^\.\./, '');
      a.classList.toggle('mobile-nav__link--active', path.includes(href));
    });
  }

  function openDrawer() {
    nav.classList.add('open');
    document.body.style.overflow = 'hidden';
    markActiveLink();
    // Mover foco al botón de cierre para accesibilidad
    btnClose?.focus();
  }

  function closeDrawer() {
    nav.classList.remove('open');
    document.body.style.overflow = '';
    // Devolver foco al botón que abrió el drawer
    btnOpen.focus();
  }

  // ── Eventos ────────────────────────────────────────────────────
  btnOpen.addEventListener('click', openDrawer);
  btnClose?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', closeDrawer);

  // Cerrar con Escape (gestión de foco dentro del drawer)
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && nav.classList.contains('open')) {
      closeDrawer();
    }
  });

  // Trampa de foco: Tab/Shift+Tab no sale del drawer mientras esté abierto
  nav.addEventListener('keydown', e => {
    if (!nav.classList.contains('open') || e.key !== 'Tab') return;
    const focusable = Array.from(
      nav.querySelectorAll('a, button, [tabindex]:not([tabindex="-1"])')
    ).filter(el => !el.disabled && el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}
