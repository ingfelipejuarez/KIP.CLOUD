/**
 * KIP · app/insights/insights.js
 * Página de Insights — ciencia de hábitos + datos personales del usuario.
 */

import { KIP_CONFIG }       from '../../src/config.js';
import { ApiClient }        from '../../src/services/ApiClient.js';
import { AuthService }      from '../../src/services/AuthService.js';
import { createDataService } from '../../src/services/DataService.js';
import { AnalizadorProgreso } from '../../src/core/models/AnalizadorProgreso.js';
import { kipLoadHabits }    from '../../src/utils/habits.js';
import { authGuard }        from '../../src/security.js';
import { PageGuard }        from '../../src/ui/pages/PageGuard.js';
import { CountUpComponent } from '../../src/ui/components/primitives/CountUp.js';
import { ScrollRevealComponent } from '../../src/ui/components/primitives/ScrollReveal.js';
import { KIP_EVENTS }       from '../../src/ui/events.js';

async function launch() {
  // Reset defensivo de modales
  ['habit-modal','modal-backdrop','cmd-palette','cmd-backdrop',
   'confirm-dialog','confirm-backdrop','settings-panel','settings-backdrop']
    .forEach(id => { const el = document.getElementById(id); if (el) el.hidden = true; });

  const puedeAcceder = await Promise.resolve(authGuard(KIP_CONFIG, ApiClient));
  if (!puedeAcceder) return;
  if (!PageGuard.claim('insights')) return;

  try {
    const dataService   = createDataService();
    const authService   = new AuthService(dataService);
    await authService.inicializar();
    const { habitos }   = await kipLoadHabits(dataService, authService);
    authService.sincronizarHabitos(habitos);

    const usuario = authService.getUsuario?.();

    // ── Datos personales ─────────────────────────────────────────
    const racha = usuario?.calcularRacha?.() ?? 0;
    const rachaEl = document.getElementById('ins-racha');
    if (rachaEl) CountUpComponent.animar(rachaEl, 0, racha);

    // Tasa de éxito este mes (% de días completados / total de días del mes)
    const hoy = new Date();
    const diasMes = hoy.getDate();
    let completadosEsteMes = 0;
    habitos.forEach(h => {
      const reg = h._registros || [];
      const esteMes = reg.filter(r => {
        const d = new Date(r.fecha || r);
        return d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
      });
      completadosEsteMes += esteMes.length;
    });
    const totalPosible = habitos.length * diasMes;
    const tasa = totalPosible > 0 ? Math.round((completadosEsteMes / totalPosible) * 100) : 0;
    const tasaEl = document.getElementById('ins-tasa');
    if (tasaEl) {
      CountUpComponent.animar(tasaEl, 0, tasa);
      // Añadir sufijo % después de la animación
      setTimeout(() => { if (tasaEl.textContent && !tasaEl.textContent.includes('%')) tasaEl.textContent += '%'; }, 700);
    }

    // Mejor semana (máximo de completados en 7 días consecutivos)
    const mejorSemanaEl = document.getElementById('ins-mejor-semana');
    if (mejorSemanaEl) {
      // Placeholder — calcular con datos reales sería cruzar todos los registros
      const mejorSemana = habitos.length * 5; // estimación conservadora
      CountUpComponent.animar(mejorSemanaEl, 0, mejorSemana);
    }

    // Hora pico — mostrar "Mañana" / "Tarde" / "Noche" como dato estático por ahora
    const horaPicoEl = document.getElementById('ins-hora-pico');
    if (horaPicoEl) horaPicoEl.textContent = 'Mañana';

    // Despachar kip:ready para que bootstrap actualice el header
    window.dispatchEvent(new CustomEvent(KIP_EVENTS.READY, {
      detail: { authService, habitos }
    }));

    // ── ScrollReveal en las cards ─────────────────────────────────
    ScrollRevealComponent.init?.();

  } catch (err) {
    console.error('[insights] error al cargar:', err);
  }
}

// Arrancar cuando los layouts estén listos
if (window.__kipLayoutsReady) {
  launch();
} else {
  window.addEventListener(KIP_EVENTS.LAYOUTS_LOADED, launch, { once: true });
  setTimeout(() => { if (!window.__kipLayoutsReady) launch(); }, 150);
}
