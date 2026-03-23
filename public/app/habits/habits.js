/**
 * KIP · app/habits/habits.js                               kip.v7
 * ─────────────────────────────────────────────────────────────────
 * Módulo de página "Mis Hábitos" completamente rediseñado.
 *
 * Arquitectura vs kip.v6:
 *  1. Estado centralizado en HabitsPageState — sin vars globales sueltas.
 *  2. Capas separadas: Data / State / Render / Events / DragDrop.
 *  3. Ordenación alineada con valores del <select> HTML
 *     (nombre | progreso | racha | categoria).
 *  4. HabitsDragDrop extraída a clase encapsulada.
 *  5. Edición inline de nota integrada sin dependencias externas.
 *  6. syncCardUI() — updates sin re-render completo del grid.
 *  7. buildCardHTML() — datos externos siempre por esc() [C-02].
 *  8. renderFatalError() en catch [C-01/W-03].
 *  9. Auth guard reforzado [W-02].
 */

import { KIP_CONFIG }              from '../../src/config.js';
import { ApiClient }               from '../../src/services/ApiClient.js';
import { createDataService }       from '../../src/services/DataService.js';
import { AuthService }             from '../../src/services/AuthService.js';
import { AnalizadorProgreso }      from '../../src/core/models/AnalizadorProgreso.js';
import { RegistroDiario }          from '../../src/core/models/RegistroDiario.js';
import { CountUpComponent }        from '../../src/ui/components/primitives/CountUp.js';
import { RippleComponent }         from '../../src/ui/components/primitives/Ripple.js';
import { DonutRingComponent }      from '../../src/ui/components/composed/DonutRing.js';
import { CategoryFilterComponent } from '../../src/ui/components/composed/CategoryFilter.js';
import { HabitModalComponent }     from '../../src/ui/components/composed/HabitModal.js';
import { HabitContextMenuComponent } from '../../src/ui/components/composed/HabitContextMenu.js';
import { SoundFeedbackComponent }  from '../../src/ui/components/composed/SoundFeedback.js';
import { ToastComponent }          from '../../src/ui/components/primitives/Toast.js';
import { SEL }                     from '../../src/ui/selectors.js';
import { kipLoadHabits, kipToggleHoy, kipCrearHabito, kipBuildCardHTML } from '../../src/utils/habits.js';
import { esc }                     from '../../src/ui/utils/sanitize.js';
import { renderFatalError }        from '../../src/ui/utils/renderFatalError.js';
import { authGuard }               from '../../src/security.js';
import { ConfirmDialog }          from '../../src/ui/components/composed/ConfirmDialog.js';
import { KIP_EVENTS }             from '../../src/ui/events.js';
import { PageGuard }              from '../../src/ui/pages/PageGuard.js';

// ═══════════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════

const PAGE_SIZE = 12;

const CAT_COLORS = {
  bienestar: '#14B8A6',
  salud:     '#F59E0B',
  mente:     '#8B5CF6',
  social:    '#F43F5E',
  trabajo:   '#06B6D4',
  general:   '#10B981',
};

const CAT_ICON_CLASS = {
  bienestar: 'hci--teal',
  salud:     'hci--amber',
  mente:     'hci--violet',
  social:    'hci--rose',
  trabajo:   'hci--cyan',
  general:   'hci--green',
};

// Paths SVG internos — no necesitan esc()
const CAT_ICONS = {
  bienestar: '<path d="M12 4C9 4 7 7 7 9.5c0 4 5 7 5 7s5-3 5-7C17 7 15 4 12 4z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/>',
  salud:     '<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  mente:     '<path d="M9 3C6 3 4 5.5 4 8c0 2.5 1.5 3.5 2 4.5V18h12v-5.5c.5-1 2-2 2-4.5 0-2.5-2-5-5-5-1 0-2 .5-2.5 1.5C11.5 3.5 10 3 9 3z" stroke="currentColor" stroke-width="1.4" fill="none"/>',
  social:    '<circle cx="9" cy="7" r="3" stroke="currentColor" stroke-width="1.4" fill="none"/><circle cx="15" cy="7" r="3" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M3 19c0-3 2.5-5 6-5h6c3.5 0 6 2 6 5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
  trabajo:   '<rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M8 7V5a2 2 0 014 0v2" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
  general:   '<path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/>',
};

// ═══════════════════════════════════════════════════════════════════
// ESTADO CENTRALIZADO
// ═══════════════════════════════════════════════════════════════════

/**
 * Fuente de verdad local del módulo.
 * Reemplaza las variables globales sueltas de kip.v6.
 */
class HabitsPageState {
  constructor() {
    this.habitos      = [];
    this.registros    = new Map();
    this.dataService  = null;
    this.authService  = null;
    this.sortBy       = 'default';
    this.page         = 1;
    this.activeFilter = 'all';
    // [B-09] Referencia a la instancia activa de HabitsDragDrop para destruirla
    //        antes de crear una nueva en cada renderGrid(), evitando acumulación
    //        de listeners de drag sobre el mismo gridEl.
    this._dragDrop        = null;
    // AbortController para los listeners de window en bindGlobalEvents.
    // Se aborta si la página se desmonta, evitando que eventos globales
    // sigan disparando handlers que referencian state de una instancia anterior.
    this._globalController = new AbortController();
  }

  get habitosFiltrados() {
    if (this.activeFilter === 'all') return this.habitos;
    return this.habitos.filter(h =>
      (h.categoria || 'general').toLowerCase() === this.activeFilter
    );
  }

  get habitosOrdenados() {
    const list = [...this.habitosFiltrados];
    switch (this.sortBy) {
      case 'nombre':    return list.sort((a, b) => a.nombre.localeCompare(b.nombre));
      case 'progreso':  return list.sort((a, b) => b.calcularProgreso() - a.calcularProgreso());
      case 'racha':     return list.sort((a, b) => (b.racha ?? 0) - (a.racha ?? 0));
      case 'categoria': return list.sort((a, b) =>
        (a.categoria || 'general').localeCompare(b.categoria || 'general')
      );
      default:          return list;
    }
  }

  get habitosVisibles() {
    return this.habitosOrdenados.slice(0, this.page * PAGE_SIZE);
  }

  get hayMas() {
    return this.habitosVisibles.length < this.habitosOrdenados.length;
  }

  get restantes() {
    return this.habitosOrdenados.length - this.habitosVisibles.length;
  }
}

// ═══════════════════════════════════════════════════════════════════
// CAPA DE RENDER
// ═══════════════════════════════════════════════════════════════════

function renderHeader(state) {
  const { completados, total } = AnalizadorProgreso.analizarHoy(state.habitos);
  const racha = state.authService.getUsuario()?.calcularRacha?.() || 0;

  const numEl   = document.getElementById(SEL.NUM_COMPLETADOS);
  const denomEl = document.getElementById(SEL.DENOM_TOTAL_PAGE);
  const rachaEl = document.getElementById(SEL.NUM_RACHA);
  const countEl = document.getElementById(SEL.HABITS_COUNT);
  const chipEl  = document.getElementById(SEL.STATUS_CHIP);

  // [B-15] parseInt("–") devuelve NaN. CountUp.animar ya tiene safeFrom/safeTo,
  //        pero la llamada con NaN llegaba igual. Normalizar aquí como defensa adicional.
  const fromNum   = (el) => { const v = parseInt(el?.textContent, 10); return Number.isFinite(v) ? v : 0; };
  if (numEl)   CountUpComponent?.animar(numEl,   fromNum(numEl),   completados);
  if (rachaEl) CountUpComponent?.animar(rachaEl, fromNum(rachaEl), racha);
  if (denomEl) denomEl.textContent = `/${total}`;
  if (countEl) countEl.textContent = String(state.habitosFiltrados.length);

  if (chipEl) {
    const pct = total > 0 ? completados / total : 0;
    const cfg =
      pct >= 0.8 ? { texto: 'En buen camino',    clase: 'chip--ok'      } :
      pct >= 0.5 ? { texto: 'A mitad de camino', clase: 'chip--warn'    } :
                   { texto: 'Recién empezando',   clase: 'chip--default' };
    chipEl.textContent = cfg.texto;
    chipEl.className   = `chip ${cfg.clase}`;
  }
}

/**
 * Construye HTML seguro de una tarjeta.
 * [C-02] Todo dato externo (id, nombre, nota, categoria, frecuencia) pasa por esc().
 */
function buildCardHTML(habito, progreso) {
  const cat       = (habito.categoria || 'general').toLowerCase();
  const catColor  = CAT_COLORS[cat]     || CAT_COLORS.general;
  const iconClass = CAT_ICON_CLASS[cat] || CAT_ICON_CLASS.general;
  const iconPath  = CAT_ICONS[cat]      || CAT_ICONS.general;
  const hecho     = habito.completadoHoy;
  const freq      = (habito.frecuencia  || 'diario').toLowerCase();

  const freqLabel = freq === 'semanal' ? 'Semanal'
                  : freq === 'mensual' ? 'Mensual'
                  : 'Diario';

  let progresoLabel;
  if (freq === 'semanal') {
    const meta = habito.metaSemanal || 3;
    progresoLabel = `${Math.round((progreso / 100) * meta)} / ${meta} esta semana`;
  } else if (freq === 'mensual') {
    const meta = habito.metaMensual || 20;
    progresoLabel = `${Math.round((progreso / 100) * meta)} / ${meta} este mes`;
  } else {
    progresoLabel = `${Math.round((progreso / 100) * 7)} / 7 esta semana`;
  }

  const notaHTML = habito.nota
    ? `<p class="hc-note hc-note--text">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 3h6M2 5h4M2 7h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
        ${esc(habito.nota)}
       </p>`
    : `<p class="hc-note hc-note--empty">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 3h6M2 5h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".4"/>
        </svg>
        Añadir nota
       </p>`;

  const trendHTML = _buildTrendBadge(habito);

  const checkInner = hecho
    ? `<svg class="check-svg" width="13" height="13" viewBox="0 0 13 13" fill="none">
         <path d="M2.5 6.5l2.8 2.8L10 4" stroke="var(--tx-on-a)"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
       </svg>`
    : '';

  return `<article class="habit-card ${hecho ? 'habit-card--done' : 'habit-card--pending'}"
     data-habito-id="${esc(habito.id)}"
     data-categoria="${esc(cat)}"
     style="--card-cat-color:${catColor}"
     role="listitem">

  <button class="hc-more" aria-label="Opciones de ${esc(habito.nombre)}" data-ctx-trigger>
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <circle cx="6.5" cy="2.5" r="1" fill="currentColor"/>
      <circle cx="6.5" cy="6.5" r="1" fill="currentColor"/>
      <circle cx="6.5" cy="10.5" r="1" fill="currentColor"/>
    </svg>
  </button>

  <div class="hc-top">
    <div class="hc-icon ${iconClass}" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">${iconPath}</svg>
    </div>
    <div class="hc-info">
      <span class="hc-name" title="${esc(habito.nombre)}">${esc(habito.nombre)}</span>
      <div class="hc-meta">
        <span class="hc-freq">${freqLabel}</span>
        ${trendHTML}
      </div>
    </div>
    <button class="hc-check ${hecho ? 'hc-check--done' : 'hc-check--pending'}"
            aria-checked="${String(hecho)}"
            aria-label="${hecho ? 'Desmarcar' : 'Completar'} ${esc(habito.nombre)}"
            role="checkbox">
      <span class="hc-check__icon">${checkInner}</span>
    </button>
  </div>

  <div class="hc-prog">
    <div class="hc-prog-track">
      <div class="hc-prog-fill" style="--prog:${Number(progreso)}%"></div>
    </div>
    <div class="hc-prog-stats">
      <span class="hc-prog-label">${progresoLabel}</span>
      <span class="hc-prog-pct">${Number(progreso)}%</span>
    </div>
  </div>

  <div class="hc-note-wrap" data-note-wrap aria-label="Nota del hábito">
    ${notaHTML}
    <input class="hc-note-edit" type="text" maxlength="80"
           placeholder="Escribe una nota\u2026"
           aria-label="Editar nota de ${esc(habito.nombre)}"
           value="${esc(habito.nota || '')}" />
  </div>

  <div class="hc-ring" data-donut data-id="${esc(habito.id)}" data-prog="${Number(progreso)}" hidden></div>
</article>`;
}

function _buildTrendBadge(habito) {
  const progActual   = habito.calcularProgreso?.() ?? 0;
  const progAnterior = habito.progresoSemanaAnterior ?? progActual;
  const delta = progActual - progAnterior;
  if (Math.abs(delta) < 5) return '<span class="hc-trend hc-trend--flat">\u2192 estable</span>';
  if (delta > 0)           return `<span class="hc-trend hc-trend--up">\u2191 +${Math.round(delta)}%</span>`;
  return                          `<span class="hc-trend hc-trend--down">\u2193 ${Math.round(delta)}%</span>`;
}

function renderGrid(state) {
  const gridEl  = document.getElementById(SEL.HABITS_FULL_GRID);
  const emptyEl = document.getElementById(SEL.HABITS_FULL_EMPTY);
  if (!gridEl) return;

  gridEl.querySelectorAll('.habit-skeleton').forEach(s => s.remove());

  const visibles = state.habitosVisibles;

  if (!visibles.length) {
    gridEl.innerHTML = '';
    if (emptyEl) emptyEl.hidden = false;
    _removeLoadMore();
    return;
  }
  if (emptyEl) emptyEl.hidden = true;

  gridEl.innerHTML = visibles.map(h => buildCardHTML(h, h.calcularProgreso?.() ?? 0)).join('');

  DonutRingComponent.initAll();
  // [B-09] Destruir instancia anterior antes de crear la nueva.
  //        Cada HabitsDragDrop añade listeners al gridEl. Sin este cleanup,
  //        tras un toggle/sort/nuevo-hábito se acumulan N instancias activas.
  state._dragDrop?.destroy();
  state._dragDrop = new HabitsDragDrop(gridEl, state);
  renderLoadMore(state, gridEl);
}

/**
 * Sincroniza el DOM de una tarjeta sin re-renderizar el grid completo.
 * Usado tras un toggle para evitar parpadeo y pérdida del foco.
 */
function syncCardUI(habitoId, habito) {
  const card = document.querySelector(`[data-habito-id="${CSS.escape(habitoId)}"]`);
  if (!card) return;

  const hecho    = habito.completadoHoy;
  const progreso = habito.calcularProgreso?.() ?? 0;

  card.classList.toggle('habit-card--done',    hecho);
  card.classList.toggle('habit-card--pending', !hecho);

  const check = card.querySelector('.hc-check');
  if (check) {
    check.classList.toggle('hc-check--done',    hecho);
    check.classList.toggle('hc-check--pending', !hecho);
    check.setAttribute('aria-checked', String(hecho));
    check.setAttribute('aria-label', `${hecho ? 'Desmarcar' : 'Completar'} ${esc(habito.nombre)}`);
    const icon = check.querySelector('.hc-check__icon');
    if (icon) {
      icon.innerHTML = hecho
        ? `<svg class="check-svg" width="13" height="13" viewBox="0 0 13 13" fill="none">
             <path d="M2.5 6.5l2.8 2.8L10 4" stroke="var(--tx-on-a)"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        : '';
    }
  }

  const fill = card.querySelector('.hc-prog-fill');
  if (fill) fill.style.setProperty('--prog', `${progreso}%`);
  const pct = card.querySelector('.hc-prog-pct');
  if (pct) pct.textContent = `${progreso}%`;

  DonutRingComponent.update(habitoId, progreso);
}

function renderLoadMore(state, gridEl) {
  _removeLoadMore();
  if (!state.hayMas) return;
  const btn = document.createElement('button');
  btn.id        = 'btn-load-more';
  btn.className = 'btn btn--ghost btn--sm';
  btn.style.cssText = 'grid-column:1/-1;margin:var(--s2) auto 0;display:block';
  btn.textContent   = `Cargar m\u00e1s (${state.restantes} restantes)`;
  btn.addEventListener('click', () => { state.page++; renderGrid(state); });
  gridEl.insertAdjacentElement('afterend', btn);
}

function _removeLoadMore() {
  document.getElementById('btn-load-more')?.remove();
}

// ═══════════════════════════════════════════════════════════════════
// CAPA DE EVENTOS
// ═══════════════════════════════════════════════════════════════════

function bindGridEvents(state) {
  const gridEl = document.getElementById(SEL.HABITS_FULL_GRID);
  if (!gridEl) return;

  // Toggle completado
  gridEl.addEventListener('click', async (e) => {
    const check = e.target.closest('.hc-check');
    if (!check) return;
    const card = check.closest('[data-habito-id]');
    if (!card) return;
    // [FIX-BUG4] Verificar que el elemento sigue en el DOM antes de operar.
    // Un re-render del grid entre el click y el handler puede haber reemplazado
    // el elemento, dejando un nodo huérfano que no debe procesarse.
    if (!gridEl.contains(check)) return;
    const habitoId = card.dataset.habitoId;

    if (check.dataset.toggling) return;
    check.dataset.toggling = '1';
    check.disabled = true;
    check.style.pointerEvents = 'none';
    RippleComponent.disparar(check, e);

    try {
      // [B-03] Pasar state.habitos para que kipToggleHoy use instancias completas en RegistroDiario.
      const nuevoEstado = await kipToggleHoy(habitoId, state.registros, state.dataService, state.habitos);
      const habito      = state.habitos.find(h => h.id === habitoId);

      nuevoEstado ? SoundFeedbackComponent.playCheck() : SoundFeedbackComponent.playUncheck();

      const { completados, total } = AnalizadorProgreso.analizarHoy(state.habitos);
      if (completados > 0 && completados === total) {
        setTimeout(() => {
          import('../../src/ui/components/primitives/Confetti.js')
            .then(({ ConfettiComponent }) => ConfettiComponent.lanzar())
            .catch(() => {});
        }, 300);
        SoundFeedbackComponent.playCelebration();
      }

      ToastComponent.show(
        nuevoEstado ? `\u2713 ${habito?.nombre} completado` : `\u25cb ${habito?.nombre} desmarcado`,
        nuevoEstado ? 'ok' : 'warn'
      );

      AnalizadorProgreso.invalidateCache(); // [FEAT-3]
      if (habito) syncCardUI(habitoId, habito);
      renderHeader(state);

    } catch {
      ToastComponent.show('No se pudo actualizar el h\u00e1bito', 'err');
    } finally {
      // [FIX-BUG4] El grid puede haberse re-renderizado durante el await,
      // reemplazando el elemento check por uno nuevo. Si el nodo original
      // ya no está en el DOM, sólo limpiamos el dataset para no dejar estado
      // colgado; el nuevo elemento no hereda el bloqueo.
      if (document.body.contains(check)) {
        delete check.dataset.toggling;
        check.disabled = false;
        check.style.pointerEvents = '';
      } else {
        // Nodo huérfano — limpiar igualmente para GC limpio
        delete check.dataset.toggling;
      }
    }
  });

  // Abrir edición de nota
  gridEl.addEventListener('click', (e) => {
    if (e.target.classList.contains('hc-note-edit')) return;
    const wrap = e.target.closest('[data-note-wrap]');
    if (!wrap) return;
    const card = wrap.closest('[data-habito-id]');
    if (!card) return;
    _openNoteEdit(wrap, card.dataset.habitoId, state);
  });

  // Guardar nota con Enter
  gridEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const input = e.target.closest('.hc-note-edit');
    if (input) { e.preventDefault(); _saveNoteEdit(input, state); }
  });

  // Guardar nota al perder foco
  gridEl.addEventListener('focusout', (e) => {
    const input = e.target.closest('.hc-note-edit');
    if (input) _saveNoteEdit(input, state);
  });
}

function _openNoteEdit(wrap, habitoId, state) {
  // Cerrar otras notas abiertas
  document.querySelectorAll('.hc-note-wrap--editing').forEach(w => {
    if (w !== wrap) _saveNoteEdit(w.querySelector('.hc-note-edit'), state, { silent: true });
  });
  const input  = wrap.querySelector('.hc-note-edit');
  const habito = state.habitos.find(h => h.id === habitoId);
  if (!input || !habito) return;
  input.value = habito.nota || '';
  wrap.classList.add('hc-note-wrap--editing');
  input.focus();
  input.select();
}

function _saveNoteEdit(input, state, opts = {}) {
  if (!input) return;
  const wrap = input.closest('[data-note-wrap]');
  if (!wrap) return;
  wrap.classList.remove('hc-note-wrap--editing');
  const habitoId = wrap.closest('[data-habito-id]')?.dataset.habitoId;
  if (!habitoId) return;
  const habito   = state.habitos.find(h => h.id === habitoId);
  if (!habito) return;
  const nuevaNota = input.value.trim().slice(0, 80);
  if (nuevaNota === (habito.nota || '')) return;
  habito.nota = nuevaNota;
  const notaP = wrap.querySelector('.hc-note');
  if (notaP) {
    // [B-10] notaP contiene un <svg> hijo. textContent vacía el elemento completo,
    //        destruyendo el ícono. Hay que actualizar solo el text node final,
    //        dejando intacto el <svg> que es el primer hijo.
    notaP.className = nuevaNota ? 'hc-note hc-note--text' : 'hc-note hc-note--empty';
    // Buscar el text node de texto (después del svg) y actualizarlo
    const textNode = [...notaP.childNodes].find(n => n.nodeType === Node.TEXT_NODE);
    if (textNode) {
      textNode.nodeValue = nuevaNota ? ` ${nuevaNota}` : ' Añadir nota';
    } else {
      // Fallback: no hay text node separado — recrear estructura completa
      const svgClone = notaP.querySelector('svg')?.cloneNode(true);
      notaP.textContent = '';
      if (svgClone) notaP.appendChild(svgClone);
      notaP.appendChild(document.createTextNode(nuevaNota ? ` ${nuevaNota}` : ' Añadir nota'));
    }
  }
  state.dataService?.updateHabito?.(habitoId, { nota: nuevaNota })
    .catch(() => { if (!opts.silent) ToastComponent.show('No se pudo guardar la nota', 'err'); });
}

function bindHeaderEvents(state) {
  document.getElementById(SEL.HABITS_SORT)?.addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    state.page   = 1;
    renderGrid(state);
  });
  document.getElementById(SEL.BTN_NUEVO_HABITO_2)?.addEventListener('click', () => {
    document.getElementById(SEL.BTN_NUEVO_HABITO)?.click();
  });
}

function bindGlobalEvents(state) {
  // AbortController propio de esta instancia de state.
  // Todos los listeners de window se vinculan a él para poder limpiarlos
  // si la página se desmonta o se reinicia (evita acumulación indefinida).
  const { signal } = state._globalController;

  // [B-02] Persistir en dataService ANTES de actualizar el UI.
  window.addEventListener(KIP_EVENTS.HABITO_CREADO, async (e) => {
    const d = e.detail;
    if (!d) return;

    try {
      // Guardar primero — el servicio asigna el id definitivo
      const habitoPersistido = await state.dataService.createHabito({
        nombre:      d.nombre,
        frecuencia:  d.frecuencia  || 'diario',
        categoria:   d.categoria   || 'general',
        nota:        d.nota        || '',
        metaSemanal: d.metaSemanal,
        metaMensual: d.metaMensual,
      });

      const nuevo = kipCrearHabito({ ...habitoPersistido });
      state.habitos.push(nuevo);
      state.registros.set(nuevo.id, new RegistroDiario(nuevo));
      AnalizadorProgreso.invalidateCache(); // [FEAT-3]
      state.page = 1;
      renderGrid(state);
      renderHeader(state);
      DonutRingComponent.initAll();
      console.debug('[habits] hábito creado y persistido ✓', nuevo.id);
    } catch (err) {
      console.error('[habits] error al persistir hábito creado:', err);
      ToastComponent.show('No se pudo guardar el hábito. Intenta de nuevo.', 'err');
    }
  }, { signal });

  // [B-37] HABITO_EDITADO: persistir en dataService y re-renderizar
  window.addEventListener(KIP_EVENTS.HABITO_EDITADO, async (e) => {
    const { id, cambios } = e.detail || {};
    if (!id || !cambios) return;
    const habito = state.habitos.find(h => h.id === id);
    if (!habito) return;
    try {
      await state.dataService.updateHabito(id, cambios);
      Object.assign(habito, cambios);
      // [E-07] Resincronizar authService con datos actualizados
      state.authService.sincronizarHabitos(state.habitos);
      AnalizadorProgreso.invalidateCache();
      const afectaCard = ['nombre', 'categoria', 'frecuencia', 'nota'].some(k => k in cambios);
      if (afectaCard) renderGrid(state);
      renderHeader(state);
      ToastComponent.show(`\u2713 "${cambios.nombre || habito.nombre}" actualizado`, 'ok');
    } catch (err) {
      console.error('[habits] error al editar:', err);
      ToastComponent.show('No se pudo guardar los cambios', 'err');
    }
  }, { signal });

  // [E-03] FILTER_CHANGED: CategoryFilter emite este evento al cambiar categoría
  //         habits.js tenía activeFilter y habitosFiltrados pero nunca escuchaba el evento
  window.addEventListener(KIP_EVENTS.FILTER_CHANGED, (e) => {
    const { filter } = e.detail || {};
    if (!filter) return;
    state.activeFilter = filter;
    state.page = 1;
    renderGrid(state);
    renderHeader(state);
  }, { signal });

  // [B-33] CTX_EDIT: abrir modal de edición con datos precargados
  window.addEventListener(KIP_EVENTS.CTX_EDIT, (e) => {
    const { id } = e.detail || {};
    if (!id) return;
    const habito = state.habitos.find(h => h.id === id);
    if (habito) HabitModalComponent.openEdit(habito);
  }, { signal });

  // [B-34] CTX_ARCHIVE: ocultar hábito de la vista
  window.addEventListener(KIP_EVENTS.CTX_ARCHIVE, async (e) => {
    const { id } = e.detail || {};
    if (!id) return;
    const ok = await ConfirmDialog.show({
      title: '\u00bfArchivar h\u00e1bito?',
      desc:  'El h\u00e1bito se ocultar\u00e1 de tu lista.',
    });
    if (!ok) return;
    try { await state.dataService.archiveHabito(id); } catch (_) {}
    const idx = state.habitos.findIndex(h => h.id === id);
    if (idx !== -1) state.habitos.splice(idx, 1);
    state.registros.delete(id);
    AnalizadorProgreso.invalidateCache();
    state.page = 1;
    renderGrid(state);
    renderHeader(state);
    ToastComponent.show('H\u00e1bito archivado', 'ok');
  }, { signal });

  // [B-35] CTX_DELETE: eliminar hábito permanentemente
  window.addEventListener(KIP_EVENTS.CTX_DELETE, async (e) => {
    const { id } = e.detail || {};
    if (!id) return;
    const habito = state.habitos.find(h => h.id === id);
    const nombre = habito?.nombre || 'este h\u00e1bito';
    const ok = await ConfirmDialog.show({
      title: `\u00bfEliminar "${nombre}"?`,
      desc:  'Esta acci\u00f3n es permanente y no se puede deshacer.',
    });
    if (!ok) return;
    try {
      await state.dataService.deleteHabito(id);
      const idx = state.habitos.findIndex(h => h.id === id);
      if (idx !== -1) state.habitos.splice(idx, 1);
      state.registros.delete(id);
      AnalizadorProgreso.invalidateCache();
      state.page = 1;
      renderGrid(state);
      renderHeader(state);
      ToastComponent.show(`"${nombre}" eliminado`, 'ok');
    } catch (err) {
      console.error('[habits] error al eliminar:', err);
      ToastComponent.show('No se pudo eliminar el h\u00e1bito', 'err');
    }
  }, { signal });
}

// ═══════════════════════════════════════════════════════════════════
// DRAG & DROP — clase encapsulada
// ═══════════════════════════════════════════════════════════════════

class HabitsDragDrop {
  constructor(gridEl, state) {
    this.gridEl     = gridEl;
    this.state      = state;
    this.dragging   = null;
    this.dropTarget = null;
    // [B-09] AbortController para limpiar todos los listeners de esta instancia
    this._controller = new AbortController();
    this._attachDraggable();
    this._bindEvents();
  }

  /** [B-09] Elimina todos los listeners de esta instancia. Llamar antes de crear una nueva. */
  destroy() {
    this._controller.abort();
  }

  _attachDraggable() {
    this.gridEl.querySelectorAll('.habit-card').forEach(card => {
      card.setAttribute('draggable', 'true');
      card.style.cursor = 'grab';
    });
  }

  _bindEvents() {
    // [B-09] Vincular todos los listeners al AbortController de esta instancia
    const { signal } = this._controller;
    this.gridEl.addEventListener('dragstart', this._onDragStart.bind(this), { signal });
    this.gridEl.addEventListener('dragend',   this._onDragEnd.bind(this),   { signal });
    this.gridEl.addEventListener('dragover',  this._onDragOver.bind(this),  { signal });
    this.gridEl.addEventListener('dragleave', this._onDragLeave.bind(this), { signal });
    this.gridEl.addEventListener('drop',      this._onDrop.bind(this),      { signal });
  }

  _onDragStart(e) {
    const card = e.target.closest('.habit-card');
    if (!card) return;
    this.dragging = card;
    e.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => card.classList.add('is-dragging'));
  }

  _onDragEnd() {
    this.dragging?.classList.remove('is-dragging');
    this.dropTarget?.classList.remove('drop-above', 'drop-below');
    this._persistOrder();
    this.dragging   = null;
    this.dropTarget = null;
  }

  _onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const card = e.target.closest('.habit-card');
    if (!card || card === this.dragging) return;
    if (this.dropTarget && this.dropTarget !== card) {
      this.dropTarget.classList.remove('drop-above', 'drop-below');
    }
    this.dropTarget = card;
    const rect  = card.getBoundingClientRect();
    const after = (e.clientY - rect.top) > rect.height / 2;
    card.classList.toggle('drop-above', !after);
    card.classList.toggle('drop-below',  after);
    this.gridEl.insertBefore(this.dragging, after ? card.nextSibling : card);
  }

  _onDragLeave(e) {
    if (!this.gridEl.contains(e.relatedTarget) && this.dropTarget) {
      this.dropTarget.classList.remove('drop-above', 'drop-below');
      this.dropTarget = null;
    }
  }

  _onDrop(e) {
    e.preventDefault();
    this.dropTarget?.classList.remove('drop-above', 'drop-below');
  }

  _persistOrder() {
    const order = [...this.gridEl.querySelectorAll('.habit-card')]
      .map(c => c.dataset.habitoId)
      .filter(Boolean);
    try { localStorage.setItem('kip_habit_order', JSON.stringify(order)); } catch (_) {}
  }
}

// ═══════════════════════════════════════════════════════════════════
// ORQUESTADOR PRINCIPAL
// ═══════════════════════════════════════════════════════════════════

async function launch() {
  // ── Reset defensivo de modales al inicio ──────────────────────
  [
    'habit-modal', 'modal-backdrop',
    'cmd-palette', 'cmd-backdrop',
    'confirm-dialog', 'confirm-backdrop',
    'settings-panel', 'settings-backdrop',
    'kbd-panel', 'kbd-backdrop',
  ].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = true; });
  // [B-01] authGuard puede devolver Promise<boolean> en producción — hay que awaitarlo.
  //        Sin el await, la Promise es siempre truthy → la página carga sin verificar sesión.
  const puedeAcceder = await Promise.resolve(authGuard(KIP_CONFIG, ApiClient));
  if (!puedeAcceder) return;

  // [FIX-7] PageGuard reemplaza window._kipHabitsStarted
  if (!PageGuard.claim('habits')) return;

  try {
    const dataService = createDataService();
    const authService = new AuthService(dataService);
    await authService.inicializar();

    const { habitos, registros } = await kipLoadHabits(dataService, authService);

    // [B-04] Sincronizar hábitos con Usuario ANTES de renderHeader() y calcularRacha().
    //        Sin este paso, Usuario._habitos está vacío → racha siempre 0.
    authService.sincronizarHabitos(habitos);

    const state        = new HabitsPageState();
    state.habitos      = habitos;
    state.registros    = registros;
    state.dataService  = dataService;
    state.authService  = authService;

    renderHeader(state);
    renderGrid(state);

    CategoryFilterComponent.init();
    HabitModalComponent.init();
    HabitContextMenuComponent.init();
    SoundFeedbackComponent.init();
    window.SoundFeedbackComponent = SoundFeedbackComponent; // SettingsPanel lo necesita

    bindGridEvents(state);
    bindHeaderEvents(state);
    bindGlobalEvents(state);

    window.dispatchEvent(new CustomEvent(KIP_EVENTS.READY, {
      detail: { dataService, authService, habitos, registros },
    }));
    console.debug('[habits] inicializado ✓', habitos.length, 'hábitos');

  } catch (err) {
    // [C-01] + [W-03]
    console.error('[habits] error fatal:', err);
    renderFatalError(document.getElementById('main'), err);
  }
}

// [B-14] Bootstrap limpio — misma vía única que dashboard.js (FIX-05).
// Un solo setTimeout de seguridad de 100ms como fallback mínimo.
if (window.__kipLayoutsReady) {
  launch();
} else {
  document.addEventListener(KIP_EVENTS.LAYOUTS_LOADED, launch, { once: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (!PageGuard.isStarted('habits')) setTimeout(launch, 100);
    }, { once: true });
  }
}
