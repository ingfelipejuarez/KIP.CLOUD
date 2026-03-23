/**
 * KIP · app/dashboard/dashboard.js                         kip.v6-DEBUG
 * ─────────────────────────────────────────────────────────────────────
 * Bugs corregidos vs versión anterior:
 *
 *  [BUG-01] Race condition: inicializar() + kipLoadHabits + getBadges
 *           en serie → ahora Promise.all paralelo donde es posible.
 *
 *  [BUG-02] kip:habito-creado en window sin cleanup → memory leak si la
 *           página se desmonta en una SPA. Ahora usa AbortController +
 *           { signal } para limpieza automática.
 *
 *  [BUG-03] habito puede ser undefined después de kipToggleHoy si el
 *           habitoId no existe en el array local (desync). Toast y
 *           DonutRing ahora comprueban antes de usar.
 *
 *  [BUG-04] renderCards llama check.innerHTML en cada toggle aunque el
 *           SVG ya esté correcto → DOM thrashing. syncCardUI() actualiza
 *           solo lo que cambia.
 *
 *  [BUG-05] StripeService.handleReturn ejecutado DESPUÉS del render
 *           completo pero ANTES de kip:ready → si falla, el evento nunca
 *           se despacha. Movido a bloque finally con try/catch propio.
 *
 *  [BUG-06] AnalizadorProgreso.analizarHoy(habitos) llamado dos veces
 *           en el mismo tick para el shareBtn → ahora cached.
 *
 *  [SECURITY] authGuard centralizado desde src/security.js.
 */

import { KIP_CONFIG }              from '../../src/config.js';
import { ShareStreakComponent }    from '../../src/ui/components/composed/ShareStreak.js';
import { StripeService }           from '../../src/services/StripeService.js';
import { ApiClient }               from '../../src/services/ApiClient.js';
import { KIPStore }                from '../../src/services/KIPStore.js';
import { ThemeManager }            from '../../src/services/ThemeManager.js';
import { LanguageService }         from '../../src/services/LanguageService.js';
import { createDataService }       from '../../src/services/DataService.js';
import { AuthService }             from '../../src/services/AuthService.js';
import { AnalizadorProgreso }      from '../../src/core/models/AnalizadorProgreso.js';
import { Badge }                   from '../../src/core/models/Badge.js';
import { RegistroDiario }          from '../../src/core/models/RegistroDiario.js';
import { SkeletonComponent }       from '../../src/ui/components/primitives/Skeleton.js';
import { CountUpComponent }        from '../../src/ui/components/primitives/CountUp.js';
import { RippleComponent }         from '../../src/ui/components/primitives/Ripple.js';
import { ConfettiComponent }       from '../../src/ui/components/primitives/Confetti.js';
import { ScrollRevealComponent }   from '../../src/ui/components/primitives/ScrollReveal.js';
import { TiltComponent }           from '../../src/ui/components/primitives/Tilt.js';
import { MagneticComponent }       from '../../src/ui/components/primitives/Magnetic.js';
import { DonutRingComponent }      from '../../src/ui/components/composed/DonutRing.js';
import { HeatmapComponent }        from '../../src/ui/components/composed/Heatmap.js';
import { CategoryFilterComponent } from '../../src/ui/components/composed/CategoryFilter.js';
import { HabitModalComponent }     from '../../src/ui/components/composed/HabitModal.js';
import { HabitContextMenuComponent } from '../../src/ui/components/composed/HabitContextMenu.js';
import { SoundFeedbackComponent }  from '../../src/ui/components/composed/SoundFeedback.js';
import { KeyboardShortcutsComponent } from '../../src/ui/components/composed/KeyboardShortcuts.js';
import { ToastComponent }          from '../../src/ui/components/primitives/Toast.js';
import { SEL }                     from '../../src/ui/selectors.js';
import { kipCrearHabito, kipLoadHabits, kipToggleHoy, kipBuildCardHTML } from '../../src/utils/habits.js';
import { renderFatalError }        from '../../src/ui/utils/renderFatalError.js';
import { esc }                     from '../../src/ui/utils/sanitize.js';
import { authGuard }               from '../../src/security.js';
import { ConfirmDialog }          from '../../src/ui/components/composed/ConfirmDialog.js';
import { KIP_EVENTS }             from '../../src/ui/events.js';
import { PageGuard }              from '../../src/ui/pages/PageGuard.js';

// ── AbortController para cleanup de listeners de ventana ──────────
// [BUG-02] Permite cancelar todos los window.addEventListener registrados
// en esta página de forma limpia cuando el módulo se desmonte.
let _pageController = new AbortController();

async function launch() {
  // ── Reset defensivo de modales al inicio ──────────────────────
  // Cierra forzosamente todos los modales/overlays antes de cualquier
  // operación. Garantiza estado limpio si el browser cacheó CSS viejo
  // o si un HMR dejó elementos abiertos de una sesión anterior.
  [
    'habit-modal', 'modal-backdrop',
    'cmd-palette', 'cmd-backdrop',
    'confirm-dialog', 'confirm-backdrop',
    'settings-panel', 'settings-backdrop',
    'kbd-panel', 'kbd-backdrop',
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  });

  // [SECURITY] Auth guard centralizado — mock solo en localhost [W-02]
  // [FIX-03] authGuard puede devolver Promise<boolean> en producción
  //          (verificación de sesión via cookie). Hay que awaitarlo.
  const puedeAcceder = await Promise.resolve(authGuard(KIP_CONFIG, ApiClient));
  if (!puedeAcceder) return;

  // [FIX-7] PageGuard reemplaza window._kipDashboardStarted
  if (!PageGuard.claim('dashboard')) return;

  // Resetear el controller por si la página fue montada antes
  _pageController = new AbortController();
  const { signal } = _pageController;

  try {
    const themeManager = ThemeManager.getInstance();
    themeManager.cargarGuardado();

    const dataService = createDataService();
    const authService = new AuthService(dataService);
    const langService = new LanguageService();

    // [BUG-01] inicializar() primero — getBadges en paralelo con kipLoadHabits
    const usuario = await authService.inicializar();

    // Actualizar saludo y fecha inmediatamente, sin esperar los hábitos
    const elSaludo = document.getElementById(SEL.SALUDO);
    const elNombre = document.getElementById(SEL.NOMBRE_USUARIO);
    const elFecha  = document.getElementById(SEL.FECHA_HOY);
    if (elSaludo) elSaludo.textContent = langService.getSaludo();
    if (elNombre) {
      elNombre.textContent = usuario.nombre;
      elNombre.setAttribute('aria-label', usuario.nombre);
    }
    if (elFecha) {
      elFecha.textContent = langService.formatFechaHoy();
      elFecha.setAttribute('datetime', langService.formatDatetime());
    }

    SkeletonComponent.activar('.habit-card');

    // [BUG-01] Cargar hábitos Y badges en paralelo — ahorra ~200ms en producción
    const [{ habitos, registros }, bdatos] = await Promise.all([
      kipLoadHabits(dataService, authService),
      dataService.getBadges(usuario.id).catch(() => []), // getBadges no es crítico
    ]);

    SkeletonComponent.desactivar('.habit-card', 80);
    bdatos.map(d => new Badge(d)).forEach(b => usuario.agregarBadge(b));

    // [FIX-02] Sincronizar hábitos con el objeto Usuario ANTES de cualquier
    // llamada a calcularRacha() (renderMetrica, ShareStreakComponent.init).
    // Sin este paso, Usuario._habitos está vacío y la racha siempre es 0.
    authService.sincronizarHabitos(habitos);

    // Poblar KIPStore UNA sola vez
    const store = KIPStore.getInstance();
    store.setState({ usuario, habitos });

    renderMetrica(habitos, usuario);

    // Inicializar el botón de compartir con datos reales
    const { completados: compHoy, total: totalHoy } = AnalizadorProgreso.analizarHoy(habitos);
    ShareStreakComponent.init({
      racha:       usuario.calcularRacha(),
      nombre:      usuario.nombre || '',
      completados: compHoy,
      total:       totalHoy,
    });

    renderCards(habitos);

    // Empty state
    const emptyEl = document.getElementById('dash-habits-empty');
    const ctaEl   = document.querySelector('.pg-cta-card');
    if (emptyEl) emptyEl.hidden = habitos.length > 0;
    if (ctaEl)   ctaEl.style.display = habitos.length > 0 ? '' : 'none';
    document.getElementById('dash-empty-btn-nuevo')
      ?.addEventListener('click', () => document.getElementById('btn-nuevo-habito')?.click(), { once: true });

    // Inicializar componentes UI
    DonutRingComponent.initAll();
    HeatmapComponent.render(habitos);
    HabitModalComponent.init();
    HabitContextMenuComponent.init();
    CategoryFilterComponent.init();
    SoundFeedbackComponent.init();
    window.SoundFeedbackComponent = SoundFeedbackComponent; // [FIX-5] SettingsPanel necesita esta referencia para sincronizar el toggle de sonido
    // ThemeSwitcherComponent ya inicializado en bootstrap.js — no duplicar aquí
    // NavbarScroll ya lo inicializa bootstrap.js — no llamar aquí para evitar doble listener
    ScrollRevealComponent.init();
    TiltComponent.init('.metric-card, .habit-card');
    MagneticComponent.init('.js-magnetic');
    KeyboardShortcutsComponent.init(themeManager, { getHabitos: () => habitos });

    // ── Toggle handler ────────────────────────────────────────────
    const grid = document.getElementById(SEL.HABITS_GRID);
    grid?.addEventListener('click', async (e) => {
      const check = e.target.closest('.hc-check');
      if (!check) return;
      const card = check.closest('[data-habito-id]');
      if (!card) return;
      const habitoId = card.dataset.habitoId;

      // Guard contra double-toggle
      if (check.dataset.toggling) return;
      check.dataset.toggling = '1';
      RippleComponent.disparar(check, e);
      check.disabled = true;
      check.style.pointerEvents = 'none';

      try {
        // [FIX-04] Pasar el array habitos para que kipToggleHoy pueda
        // trabajar con la instancia completa del hábito en el RegistroDiario.
        const nuevoEstado = await kipToggleHoy(habitoId, registros, dataService, habitos);

        // [BUG-03] habito puede no existir en el array local si hay desync
        const habito = habitos.find(h => h.id === habitoId);
        if (!habito) {
          console.warn('[dashboard] toggle: habitoId no encontrado en array local:', habitoId);
          ToastComponent.show('Hábito actualizado', 'ok');
          return;
        }

        nuevoEstado ? SoundFeedbackComponent.playCheck() : SoundFeedbackComponent.playUncheck();

        const { completados, total } = AnalizadorProgreso.analizarHoy(habitos);
        if (completados > 0 && completados === total) {
          setTimeout(() => ConfettiComponent.lanzar(), 300);
          SoundFeedbackComponent.playCelebration();
        }

        // [BUG-03] esc() garantiza que habito.nombre nunca inyecte HTML
        ToastComponent.show(
          nuevoEstado
            ? `✓ ${esc(habito.nombre)} completado`
            : `○ ${esc(habito.nombre)} desmarcado`,
          nuevoEstado ? 'ok' : 'warn'
        );

        // [FEAT-3] Invalidar caché de AnalizadorProgreso tras mutar completadoHoy
        AnalizadorProgreso.invalidateCache();
        renderMetrica(habitos, usuario);

        // [BUG-04] syncCardUI en lugar de renderCards completo — evita DOM thrashing
        syncCardUI(card, habito);
        DonutRingComponent.update(habitoId, habito.calcularProgreso?.() ?? 0);
        HeatmapComponent.render(habitos);

      } catch (err) {
        console.error('[dashboard] toggle error:', err);
        ToastComponent.show('No se pudo actualizar el hábito', 'err');
      } finally {
        delete check.dataset.toggling;
        check.disabled = false;
        check.style.pointerEvents = '';
      }
    });

    // ── kip:habito-creado ─────────────────────────────────────────
    // [BUG-02] { signal } permite cleanup automático del listener
    // [FIX-01] Persistir en dataService ANTES de actualizar el UI.
    //          Sin esta llamada, el hábito solo existía en memoria y se
    //          perdía al recargar la página.
    window.addEventListener(KIP_EVENTS.HABITO_CREADO, async (e) => {
      const d = e.detail;
      if (!d) return;

      try {
        // [FIX-01] Guardar en almacenamiento persistente primero.
        // createHabito() devuelve el objeto con el id definitivo asignado
        // por el DataService (evita colisiones de id entre mock y real API).
        const habitoPersistido = await dataService.createHabito({
          nombre:      d.nombre,
          frecuencia:  d.frecuencia || 'diario',
          categoria:   d.categoria  || 'general',
          nota:        d.nota       || '',
          metaSemanal: d.metaSemanal,
          metaMensual: d.metaMensual,
        });

        // Construir el objeto en memoria usando el id/datos devueltos por el servicio
        const nuevoHabito = kipCrearHabito({ ...habitoPersistido });

        habitos.push(nuevoHabito);
        registros.set(nuevoHabito.id, new RegistroDiario(nuevoHabito));

        const g = document.getElementById(SEL.HABITS_GRID);
        if (g) {
          g.insertAdjacentHTML('beforeend', kipBuildCardHTML(nuevoHabito, 0));
          const newCard = g.lastElementChild;
          if (newCard) {
            newCard.style.animation = 'revealCard var(--d-base) var(--e-out)';
            const ring = newCard.querySelector('.hc-ring');
            if (ring) DonutRingComponent._inject(ring);
          }
        }

        const countEl = document.getElementById(SEL.HABITS_COUNT);
        if (countEl) countEl.textContent = String(habitos.length);
        AnalizadorProgreso.invalidateCache(); // [FEAT-3]
        renderMetrica(habitos, usuario);

        // Ocultar empty state al añadir el primer hábito
        const empty = document.getElementById('dash-habits-empty');
        if (empty && habitos.length > 0) empty.hidden = true;

        console.debug('[dashboard] hábito creado y persistido ✓', nuevoHabito.id);
      } catch (err) {
        console.error('[dashboard] error al persistir hábito creado:', err);
        ToastComponent.show('No se pudo guardar el hábito. Intenta de nuevo.', 'err');
      }
    }, { signal });

    // ── CTX_EDIT — abrir modal de edición con datos precargados ──
    // [B-33] El evento se emitía desde HabitContextMenu pero nadie lo escuchaba
    window.addEventListener(KIP_EVENTS.CTX_EDIT, (e) => {
      const { id } = e.detail || {};
      if (!id) return;
      const habito = habitos.find(h => h.id === id);
      if (!habito) return;
      HabitModalComponent.openEdit(habito);
    }, { signal });

    // ── CTX_ARCHIVE — ocultar hábito de la vista sin eliminarlo ───
    // [B-34] El evento se emitía pero no había listener
    window.addEventListener(KIP_EVENTS.CTX_ARCHIVE, async (e) => {
      const { id } = e.detail || {};
      if (!id) return;
      const ok = await ConfirmDialog.show({
        title: '¿Archivar hábito?',
        desc:  'El hábito se ocultará de tu lista. Puedes recuperarlo desde Configuración.',
      });
      if (!ok) return;
      try {
        await dataService.archiveHabito(id); // [E-04] persistir en storage
      } catch (_) { /* no crítico — continúa con limpieza visual */ }
      const idx = habitos.findIndex(h => h.id === id);
      if (idx === -1) return;
      habitos.splice(idx, 1);
      registros.delete(id);
      document.querySelector(`[data-habito-id="${CSS.escape(id)}"]`)?.remove();
      AnalizadorProgreso.invalidateCache();
      renderMetrica(habitos, usuario);
      const emptyEl = document.getElementById('dash-habits-empty');
      if (emptyEl) emptyEl.hidden = habitos.length > 0;
      ToastComponent.show('Hábito archivado', 'ok');
      console.debug('[dashboard] hábito archivado:', id);
    }, { signal });

    // ── CTX_DELETE — eliminar hábito permanentemente ───────────────
    // [B-35] El evento se emitía pero no había listener
    window.addEventListener(KIP_EVENTS.CTX_DELETE, async (e) => {
      const { id } = e.detail || {};
      if (!id) return;
      const habito = habitos.find(h => h.id === id);
      const nombre = habito?.nombre || 'este hábito';
      const ok = await ConfirmDialog.show({
        title: `¿Eliminar "${nombre}"?`,
        desc:  'Esta acción es permanente y no se puede deshacer.',
      });
      if (!ok) return;
      try {
        await dataService.deleteHabito(id);
        const idx = habitos.findIndex(h => h.id === id);
        if (idx !== -1) habitos.splice(idx, 1);
        registros.delete(id);
        document.querySelector(`[data-habito-id="${CSS.escape(id)}"]`)?.remove();
        AnalizadorProgreso.invalidateCache();
        renderMetrica(habitos, usuario);
        const emptyEl = document.getElementById('dash-habits-empty');
        if (emptyEl) emptyEl.hidden = habitos.length > 0;
        ToastComponent.show(`"${nombre}" eliminado`, 'ok');
        console.debug('[dashboard] hábito eliminado:', id);
      } catch (err) {
        console.error('[dashboard] error al eliminar hábito:', err);
        ToastComponent.show('No se pudo eliminar el hábito', 'err');
      }
    }, { signal });

    // ── CTX_EDIT → HABITO_EDITADO — persistir cambios en dataService ─
    // [B-37] HabitModal emite HABITO_EDITADO al guardar edición pero nadie
    //        lo conectaba con el dataService ni actualizaba el objeto en memoria.
    window.addEventListener(KIP_EVENTS.HABITO_EDITADO, async (e) => {
      const { id, cambios } = e.detail || {};
      if (!id || !cambios) return;
      const habito = habitos.find(h => h.id === id);
      if (!habito) return;
      try {
        await dataService.updateHabito(id, cambios);
        Object.assign(habito, cambios);
        // [E-07] Resincronizar authService para que calcularRacha() use datos actualizados
        authService.sincronizarHabitos(habitos);
        AnalizadorProgreso.invalidateCache();
        // Re-renderizar solo la tarjeta afectada
        const card = document.querySelector(`[data-habito-id="${CSS.escape(id)}"]`);
        if (card) {
          const grid = document.getElementById(SEL.HABITS_GRID);
          if (grid) {
            // Reemplazar la tarjeta con los datos nuevos
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = kipBuildCardHTML(habito, habito.calcularProgreso?.() ?? 0);
            const newCard = tempDiv.firstElementChild;
            if (newCard) {
              grid.replaceChild(newCard, card);
              const ring = newCard.querySelector('.hc-ring');
              if (ring) DonutRingComponent._inject(ring);
            }
          }
        }
        renderMetrica(habitos, usuario);
        ToastComponent.show(`✓ "${cambios.nombre || habito.nombre}" actualizado`, 'ok');
      } catch (err) {
        console.error('[dashboard] error al editar hábito:', err);
        ToastComponent.show('No se pudo guardar los cambios', 'err');
      }
    }, { signal });

    // [BUG-05] StripeService en su propio try/catch — un fallo aquí
    // NO debe impedir que kip:ready se despache
    try {
      const stripeResult = await StripeService.handleReturn({ store, usuario });
      if (stripeResult === 'success') {
        ToastComponent.show('🎉 ¡Bienvenido a Premium! Ya tienes acceso a la IA.', 'ok');
      } else if (stripeResult === 'cancel') {
        ToastComponent.show('Pago cancelado. Tu plan no ha cambiado.', 'warn');
      }
    } catch (stripeErr) {
      console.warn('[dashboard] StripeService.handleReturn falló (no crítico):', stripeErr);
    }

    // kip:ready — notificar al resto de módulos que los datos están listos
    window.dispatchEvent(new CustomEvent(KIP_EVENTS.READY, {
      detail: { dataService, authService, habitos, registros },
    }));

    console.debug('[dashboard] inicializado ✓', habitos.length, 'hábitos');

  } catch (err) {
    console.error('[dashboard] error fatal:', err);
    renderFatalError(document.getElementById('main'), err);
  }
}

// ── renderMetrica ─────────────────────────────────────────────────
function renderMetrica(habitos, usuario) {
  const { completados, total, porcentaje } = AnalizadorProgreso.analizarHoy(habitos);

  const elNum = document.getElementById(SEL.NUM_COMPLETADOS);
  if (elNum) CountUpComponent.animar(elNum, parseInt(elNum.textContent) || 0, completados, 600);

  const elDenom = document.getElementById(SEL.DENOM_TOTAL);
  if (elDenom) {
    elDenom.classList.remove('skeleton'); // [FIX-09] quitar shimmer al hidratar
    elDenom.textContent = `/${total}`;
  }

  const fill = document.getElementById(SEL.PROG_FILL_HERO);
  const pct  = document.getElementById(SEL.PROG_PCT_HERO);
  if (fill) fill.style.setProperty('--prog', `${porcentaje}%`);
  if (pct) {
    pct.classList.remove('skeleton'); // [FIX-09] quitar shimmer al hidratar
    pct.textContent = `${porcentaje}%`;
  }

  const chip = document.getElementById(SEL.STATUS_CHIP);
  if (chip) {
    const estado = AnalizadorProgreso.evaluarEstado(porcentaje);
    const map = {
      bueno:   { texto: 'En buen camino',  clase: 'chip--ok'   },
      regular: { texto: 'Progresando',     clase: 'chip--warn' },
      bajo:    { texto: 'Necesita empuje', clase: 'chip--err'  },
    };
    const cfg = map[estado] ?? map.bajo;
    chip.textContent = cfg.texto;
    chip.className   = `chip ${cfg.clase}`;
  }

  const elRacha = document.getElementById(SEL.NUM_RACHA);
  if (elRacha && usuario) {
    CountUpComponent.animar(elRacha, parseInt(elRacha.textContent) || 0, usuario.calcularRacha(), 800);
  }

  const elCount = document.getElementById(SEL.HABITS_COUNT);
  if (elCount) elCount.textContent = String(total);
}

// ── renderCards — render inicial completo ─────────────────────────
// Solo se usa en el primer render y al añadir hábitos.
// Para actualizaciones de toggle se usa syncCardUI() [BUG-04].
function renderCards(habitos) {
  habitos.forEach(h => {
    const card = document.querySelector(`[data-habito-id="${CSS.escape(h.id)}"]`);
    if (!card) return;
    syncCardUI(card, h);
  });
}

// ── syncCardUI — actualización quirúrgica de una tarjeta ──────────
// [BUG-04] En lugar de reescribir innerHTML del check en cada toggle,
// solo modifica los atributos y clases que cambiaron.
function syncCardUI(card, habito) {
  if (!card || !habito) return;

  const hecho    = habito.completadoHoy;
  const progreso = habito.calcularProgreso ? habito.calcularProgreso() : 0;

  card.classList.toggle('habit-card--done',    hecho);
  card.classList.toggle('habit-card--pending', !hecho);

  const check = card.querySelector('.hc-check');
  if (check) {
    const yaTieneIcono = Boolean(check.querySelector('.check-svg'));

    check.classList.toggle('hc-check--done',    hecho);
    check.classList.toggle('hc-check--pending', !hecho);
    check.setAttribute('aria-checked', String(hecho));
    check.setAttribute('aria-label', `${hecho ? 'Desmarcar' : 'Completar'} ${esc(habito.nombre)}`);

    // Solo tocar innerHTML si el estado del icono es diferente — [BUG-04]
    if (hecho && !yaTieneIcono) {
      check.innerHTML = `<span class="hc-check__icon"><svg class="check-svg" width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2.5 6.5l2.8 2.8L10 4" stroke="var(--tx-on-a)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
    } else if (!hecho && yaTieneIcono) {
      check.innerHTML = `<span class="hc-check__icon"></span>`;
    }
  }

  const pgFill = card.querySelector('.hc-prog-fill');
  if (pgFill) pgFill.style.setProperty('--prog', `${progreso}%`);

  const pgPct = card.querySelector('.hc-prog-pct');
  if (pgPct) pgPct.textContent = `${progreso}%`;

  const pgLabel = card.querySelector('.hc-prog-label');
  if (pgLabel) {
    const freq = habito.frecuencia?.toLowerCase() || 'diario';
    if (freq === 'semanal') {
      const meta = habito.metaSemanal || 3;
      pgLabel.textContent = `${Math.round((progreso / 100) * meta)} / ${meta} esta semana`;
    } else if (freq === 'mensual') {
      const meta = habito.metaMensual || 20;
      pgLabel.textContent = `${Math.round((progreso / 100) * meta)} / ${meta} este mes`;
    } else {
      pgLabel.textContent = `${Math.round((progreso / 100) * 7)} / 7 esta semana`;
    }
  }
}

// ── Bootstrap ──────────────────────────────────────────────────────
// [FIX-05] Vía de entrada única: LAYOUTS_LOADED es el contrato oficial
// de bootstrap.js. Los múltiples setTimeout actuaban como fallbacks
// que podían disparar launch() dos veces si los eventos se solapaban.
// PageGuard.claim() ya protege contra dobles ejecuciones, pero la
// lógica de múltiples timers añadía ruido y dificultaba el debugging.
//
// Nuevo contrato:
//   · Si bootstrap.js ya completó  → __kipLayoutsReady está en true,
//     lanzamos directamente (path síncrono, sin timer).
//   · Si bootstrap.js aún no acabó → escuchamos LAYOUTS_LOADED (path async).
// Un solo setTimeout de seguridad (100 ms) solo cubre el edge-case de
// módulos cargados fuera de bootstrap (tests, iframes, etc.).
if (window.__kipLayoutsReady) {
  launch();
} else {
  document.addEventListener(KIP_EVENTS.LAYOUTS_LOADED, launch, { once: true });

  // Fallback mínimo: si el evento nunca llega (módulo cargado fuera de
  // bootstrap, entorno de tests, etc.), esperamos a DOMContentLoaded y
  // lanzamos una sola vez con un pequeño delay para dejar que los
  // componentes síncronos de la página terminen de registrarse.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Solo si LAYOUTS_LOADED no llegó antes
      if (!PageGuard.isStarted('dashboard')) {
        setTimeout(launch, 100);
      }
    }, { once: true });
  }
}
