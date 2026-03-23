/**
 * KIP · app/achievements/achievements.js
 * Carga badges reales desde DataService, calcula progreso
 * con los hábitos del usuario y renderiza dinámicamente.
 *
 * Correcciones aplicadas (kip.v6):
 *   [C-01] innerHTML en bloque de error → renderFatalError (createElement + textContent)
 *   [C-02] badge.nombre y badge.descripcion sin escapar → esc() en todos los template literals
 *   [W-02] Auth guard reforzado — mock solo en localhost
 *   [W-03] Bloque de error duplicado → módulo compartido renderFatalError
 */
import { KIP_CONFIG }              from '../../src/config.js';
import { ApiClient }               from '../../src/services/ApiClient.js';
import { createDataService }       from '../../src/services/DataService.js';
import { AuthService }             from '../../src/services/AuthService.js';
import { CountUpComponent }        from '../../src/ui/components/primitives/CountUp.js';
import { ScrollRevealComponent }   from '../../src/ui/components/primitives/ScrollReveal.js';
import { TiltComponent }           from '../../src/ui/components/primitives/Tilt.js';
import { kipLoadHabits }           from '../../src/utils/habits.js';
import { esc }                     from '../../src/ui/utils/sanitize.js';
import { renderFatalError }        from '../../src/ui/utils/renderFatalError.js';
import { SEL }                       from '../../src/ui/selectors.js';
import { authGuard }               from '../../src/security.js';
import { KIP_EVENTS }             from '../../src/ui/events.js';
import { PageGuard }              from '../../src/ui/pages/PageGuard.js';

// ── Badge definitions con iconos SVG ─────────────────────────────
const BADGE_DEFS = {
  b1:  { icon: 'gold',   svg: '<path d="M12 2l2 6h6.5l-5.3 3.8 2 6L12 14.2 6.8 17.8l2-6L3.5 8H10L12 2z" fill="currentColor"/>' },
  b2:  { icon: 'amber',  svg: '<circle cx="12" cy="12" r="4.5" fill="currentColor"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5.6 5.6l1.4 1.4M16.9 16.9l1.4 1.4M5.6 18.4l1.4-1.4M16.9 7.1l1.4-1.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' },
  b3:  { icon: 'teal',   svg: '<path d="M3 15l5-5 3.5 3.5L18 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 6h-4M18 6v4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' },
  b4:  { icon: 'violet', svg: '<circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.5"/><path d="M8.5 12l2.5 2.5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
  b5:  { icon: 'rose',   svg: '<path d="M12 2l2.8 8.5H23l-7 5 2.7 8.5L12 19.5l-6.7 4.5 2.7-8.5-7-5H9.2L12 2z" fill="currentColor"/>' },
  b6:  { icon: 'green',  svg: '<path d="M12 3C8 3 5 7 5 11.5c0 6 7 10.5 7 10.5S19 17.5 19 11.5C19 7 16 3 12 3z" fill="currentColor"/>' },
  b7:  { icon: 'amber',  svg: '<path d="M12 3a3 3 0 100 6 3 3 0 000-6z" fill="currentColor"/><path d="M5 21c0-3.9 3.1-7 7-7s7 3.1 7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M12 10v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' },
  b8:  { icon: 'teal',   svg: '<rect x="2" y="2" width="9" height="9" rx="2" stroke="currentColor" stroke-width="1.5"/><rect x="13" y="2" width="9" height="9" rx="2" stroke="currentColor" stroke-width="1.5"/><rect x="2" y="13" width="9" height="9" rx="2" stroke="currentColor" stroke-width="1.5"/><rect x="13" y="13" width="9" height="9" rx="2" stroke="currentColor" stroke-width="1.5"/>' },
  b9:  { icon: 'violet', svg: '<path d="M12 22s8-4.5 8-11.5a8 8 0 10-16 0C4 17.5 12 22 12 22z" fill="currentColor" opacity=".3"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' },
  b10: { icon: 'gold',   svg: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M12 7v5l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="2" fill="currentColor"/>' },
  b11: { icon: 'rose',   svg: '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" stroke="currentColor" stroke-width="1.5"/><path d="M9 22V12h6v10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' },
  b12: { icon: 'gold',   svg: '<path d="M12 2l2.5 7.5H22l-6.5 4.7 2.5 7.5L12 17.3l-6 4.4 2.5-7.5L2 9.5h7.5L12 2z" fill="currentColor"/><circle cx="12" cy="12" r="3" fill="var(--bg-0)"/>' },
};

const LOCK_SVG = '<svg width="11" height="11" viewBox="0 0 9 9" fill="none"><rect x="1" y="4" width="7" height="4.5" rx="1" stroke="currentColor" stroke-width="1.1"/><path d="M2.5 4V3A2 2 0 016.5 3v1" stroke="currentColor" stroke-width="1.1"/></svg>';

/**
 * [C-02] Todos los campos externos (nombre, descripcion) pasan por esc().
 * Los paths SVG de BADGE_DEFS son literales internos — no necesitan esc().
 * Los valores numéricos (racha, pct, meta) se fuerzan con Number() para
 * garantizar que no se cuelen strings con HTML.
 */
function buildBadgeCard(badge, racha) {
  const def      = BADGE_DEFS[badge.id] || BADGE_DEFS.b1;
  const safeName = esc(badge.nombre);
  const safeDesc = esc(badge.descripcion);

  if (badge.desbloqueado) {
    return `<div class="badge-card-full badge-card-full--unlocked">
      <div class="badge-icon-lg bi--${def.icon}">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">${def.svg}</svg>
      </div>
      <span class="badge-card-full__name">${safeName}</span>
      <span class="badge-card-full__desc">${safeDesc}</span>
    </div>`;
  }

  const metas = { b3: 21, b4: 30, b5: 50, b6: 100, b7: 5, b8: 5, b9: 7, b10: 3, b11: 4, b12: 365 };
  const meta  = metas[badge.id] || 30;
  const pct   = Math.min(Math.round((Number(racha) / meta) * 100), 99);

  return `<div class="badge-card-full badge-card-full--locked">
    <div class="badge-icon-lg bi--${def.icon}">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">${def.svg}</svg>
    </div>
    <span class="badge-card-full__name">${safeName}</span>
    <span class="badge-card-full__desc">${safeDesc}</span>
    <div class="badge-progress-bar">
      <div class="badge-progress-fill" style="width:${Number(pct)}%"></div>
    </div>
    <span style="font-family:var(--f-mono);font-size:var(--tx-2xs);color:var(--tx-3)">
      Día ${Number(racha)} / ${Number(meta)}
    </span>
    <div class="badge-card-full__lock">${LOCK_SVG}</div>
  </div>`;
}

async function launch() {
  // ── Reset defensivo de modales al inicio ──────────────────────
  [
    'habit-modal', 'modal-backdrop',
    'cmd-palette', 'cmd-backdrop',
    'confirm-dialog', 'confirm-backdrop',
    'settings-panel', 'settings-backdrop',
    'kbd-panel', 'kbd-backdrop',
  ].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = true; });
  // [B-07] authGuard puede devolver Promise<boolean> en producción — awaitar siempre.
  const puedeAcceder = await Promise.resolve(authGuard(KIP_CONFIG, ApiClient));
  if (!puedeAcceder) return;
  // [FIX-7] PageGuard reemplaza window._kipAchievementsStarted
  if (!PageGuard.claim('achievements')) return;

  try {
    const dataService  = createDataService();
    const authService  = new AuthService(dataService);
    const usuario      = await authService.inicializar();
    const { habitos }  = await kipLoadHabits(dataService, authService);

    // [B-18 — parcial, Fase 3 completa] Usar sincronizarHabitos para evitar duplicados
    authService.sincronizarHabitos(habitos);
    const badges       = await dataService.getBadges(usuario.id);

    // [B-18] Usar sincronizarHabitos() en lugar de agregarHabito() en bucle.
    //        El bucle acumulaba duplicados si launch() se llamaba más de una vez.
    const racha = usuario.calcularRacha();

    // Separar badges
    const desbloqueados = badges.filter(b => b.desbloqueado);
    const bloqueados    = badges.filter(b => !b.desbloqueado);

    // Renderizar grids
    const gridUnlocked = document.getElementById(SEL.BADGES_UNLOCKED);
    const gridLocked   = document.getElementById(SEL.BADGES_LOCKED);
    if (gridUnlocked) gridUnlocked.innerHTML = desbloqueados.map(b => buildBadgeCard(b, racha)).join('');
    if (gridLocked)   gridLocked.innerHTML   = bloqueados.map(b => buildBadgeCard(b, racha)).join('');

    // Actualizar stats
    const statUnlocked = document.getElementById(SEL.ACH_STAT_UNLOCKED);
    const statLocked   = document.getElementById(SEL.ACH_STAT_LOCKED);
    const statRacha    = document.getElementById(SEL.ACH_STAT_RACHA);
    if (statUnlocked) CountUpComponent.animar(statUnlocked, 0, desbloqueados.length);
    if (statLocked)   CountUpComponent.animar(statLocked,   0, bloqueados.length);
    if (statRacha) {
      const span = statRacha.querySelector('[data-target]') || statRacha;
      CountUpComponent.animar(span, 0, racha);
    }

    ScrollRevealComponent?.init?.();
    TiltComponent?.init?.('.badge-card-full');

    // [FIX-B1] Despachar kip:ready para que AccountComponent actualice
    // el dropdown con el nombre real del usuario.
    window.dispatchEvent(new CustomEvent(KIP_EVENTS.READY, {
      detail: { dataService, authService, habitos, registros: new Map() },
    }));
    console.debug('[achievements] inicializado ✓', desbloqueados.length, 'desbloqueados');
  } catch (err) {
    // [C-01] + [W-03] — bloque de error centralizado, sin innerHTML con datos externos
    console.error('[achievements] error fatal:', err);
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
      if (!PageGuard.isStarted('achievements')) setTimeout(launch, 100);
    }, { once: true });
  }
}
