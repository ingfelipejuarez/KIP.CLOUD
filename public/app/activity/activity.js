/**
 * KIP · app/activity/activity.js                           kip.v6-DEBUG
 * ─────────────────────────────────────────────────────────────────────
 * Bugs corregidos:
 *
 *  [BUG-07] .period-btn listeners se acumulan: si launch() se ejecuta
 *           dos veces (timing race entre kip:layouts-loaded y el setTimeout
 *           fallback), cada botón recibe N listeners duplicados.
 *           Fix: usar { signal } + AbortController — al reiniciar el
 *           controller todos los listeners previos se eliminan en una sola línea.
 *
 *  [BUG-08] import de esc faltante — XSS potencial en heatmap-summary
 *           si el texto del usuario llegara desde la API real.
 *
 *  [BUG-09] [data-target] sin validación de rango — si el servidor
 *           devuelve un número negativo o NaN el CountUp falla silenciosamente.
 *
 *  [BUG-10] authService.getUsuario() llamado fuera del try/catch →
 *           si inicializar() falló parcialmente lanza TypeError.
 */

import { KIP_CONFIG }          from '../../src/config.js';
import { ApiClient }            from '../../src/services/ApiClient.js';
import { createDataService }    from '../../src/services/DataService.js';
import { AuthService }          from '../../src/services/AuthService.js';
import { AnalizadorProgreso }   from '../../src/core/models/AnalizadorProgreso.js';
import { CountUpComponent }     from '../../src/ui/components/primitives/CountUp.js';
import { HeatmapComponent }     from '../../src/ui/components/composed/Heatmap.js';
import { kipLoadHabits }        from '../../src/utils/habits.js';
import { renderFatalError }     from '../../src/ui/utils/renderFatalError.js';
import { SEL }                   from '../../src/ui/selectors.js';
import { authGuard }            from '../../src/security.js';
import { KIP_EVENTS }          from '../../src/ui/events.js';
import { PageGuard }           from '../../src/ui/pages/PageGuard.js';

// [BUG-07] Controller de página — permite cancelar todos los listeners
// de periodo con un solo abort() si launch() se llama más de una vez
let _activityController = new AbortController();

async function launch() {
  // ── Reset defensivo de modales al inicio ──────────────────────
  [
    'habit-modal', 'modal-backdrop',
    'cmd-palette', 'cmd-backdrop',
    'confirm-dialog', 'confirm-backdrop',
    'settings-panel', 'settings-backdrop',
    'kbd-panel', 'kbd-backdrop',
  ].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = true; });
  // [B-05] authGuard puede devolver Promise<boolean> en producción — awaitar siempre.
  const puedeAcceder = await Promise.resolve(authGuard(KIP_CONFIG, ApiClient));
  if (!puedeAcceder) return;

  // [FIX-7] PageGuard reemplaza window._kipActivityStarted
  if (!PageGuard.claim('activity')) return;

  // [BUG-07] Abortar listeners de la ejecución anterior (si los hay)
  _activityController.abort();
  _activityController = new AbortController();
  const { signal } = _activityController;

  try {
    const dataService = createDataService();
    const authService = new AuthService(dataService);
    await authService.inicializar();
    const { habitos } = await kipLoadHabits(dataService, authService);

    // [B-06] Sincronizar hábitos con Usuario antes de calcularRacha().
    authService.sincronizarHabitos(habitos);

    // [B-36] Leer el period-btn activo para el render inicial
    const activePeriodBtn = document.querySelector('.period-btn.active');
    const initialPeriod   = parseInt(activePeriodBtn?.dataset.period, 10) || 90;
    HeatmapComponent.render(habitos, SEL.HEATMAP_GRID, SEL.HEATMAP_MONTHS, initialPeriod);

    // [BUG-08] Texto del summary con textContent — no innerHTML
    const { completados, total } = AnalizadorProgreso.analizarHoy(habitos);
    const summaryEl = document.getElementById(SEL.HEATMAP_SUMMARY);
    if (summaryEl) {
      summaryEl.textContent = `${completados} de ${total} hábitos completados hoy`;
    }

    // [BUG-09] Validar que data-target sea un número finito y no negativo
    // Excluir num-racha del loop — se anima individualmente con valor real
    document.querySelectorAll('[data-target]').forEach(el => {
      if (el.id === SEL.NUM_RACHA) return; // se maneja abajo con racha real
      const raw    = parseInt(el.dataset.target, 10);
      const target = Number.isFinite(raw) && raw >= 0 ? raw : 0;
      CountUpComponent.animar(el, 0, target);
    });

    // [BUG-10] getUsuario() dentro del try — nunca fuera de él
    const racha   = authService.getUsuario()?.calcularRacha?.() || 0;
    const rachaEl = document.getElementById(SEL.NUM_RACHA);
    if (rachaEl) CountUpComponent.animar(rachaEl, 0, racha);

    // [BUG-07] { signal } vincula los listeners al controller
    // Al llamar _activityController.abort(), todos se eliminan automáticamente
    document.querySelectorAll('.period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const period = parseInt(btn.dataset.period, 10) || 90;
        const pillEl = document.getElementById(SEL.HEATMAP_PILL);
        if (pillEl) pillEl.textContent = `${period} días`;
        // [B-36] Pasar period como 4º argumento — antes siempre renderizaba 91 días
        HeatmapComponent.render(habitos, SEL.HEATMAP_GRID, SEL.HEATMAP_MONTHS, period);
      }, { signal });
    });

    // [FIX-B1] Despachar kip:ready para que AccountComponent actualice el dropdown
    window.dispatchEvent(new CustomEvent(KIP_EVENTS.READY, {
      detail: { dataService, authService, habitos, registros: new Map() },
    }));
    console.debug('[activity] inicializado ✓');

  } catch (err) {
    console.error('[activity] error fatal:', err);
    renderFatalError(document.getElementById(SEL.MAIN), err);
  }
}

// [B-14] Bootstrap limpio — vía única LAYOUTS_LOADED.
if (window.__kipLayoutsReady) {
  launch();
} else {
  document.addEventListener(KIP_EVENTS.LAYOUTS_LOADED, launch, { once: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (!PageGuard.isStarted('activity')) setTimeout(launch, 100);
    }, { once: true });
  }
}
