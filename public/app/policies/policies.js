/**
 * KIP · app/policies/policies.js
 * Página de política de privacidad — estática con mínima lógica JS.
 */
import { createDataService } from '../../src/services/DataService.js';
import { AuthService }       from '../../src/services/AuthService.js';
import { KIP_EVENTS }        from '../../src/ui/events.js';
import { PageGuard }         from '../../src/ui/pages/PageGuard.js';

async function launch() {
  if (!PageGuard.claim('policies')) return;

  // Inicializar usuario para que el AccountComponent tenga datos reales
  try {
    const dataService = createDataService();
    const authService = new AuthService(dataService);
    await authService.inicializar();
    window.dispatchEvent(new CustomEvent(KIP_EVENTS.READY, {
      detail: { authService, habitos: [] },
    }));
  } catch (_) { /* página estática — no crítico */ }

  // Smooth scroll para los links del TOC
  document.querySelectorAll('.pol-toc__list a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.pushState(null, '', link.getAttribute('href'));
    });
  });
}

document.addEventListener(KIP_EVENTS.LAYOUTS_LOADED, launch, { once: true });
if (window.__kipLayoutsReady) launch();
