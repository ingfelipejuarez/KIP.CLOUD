/**
 * KIP · src/utils/habits.js
 * Funciones utilitarias para el módulo de hábitos.
 */
import { esc }               from '../ui/utils/sanitize.js';
import { RegistroDiario }    from '../core/models/RegistroDiario.js';
import { AnalizadorProgreso } from '../core/models/AnalizadorProgreso.js';

/**
 * Carga los hábitos del usuario desde el dataService.
 * @returns {{ habitos: Array, registros: Map }}
 */
export async function kipLoadHabits(dataService, authService) {
  const usuario = authService.getUsuario();
  const habitos = await dataService.getHabitos(usuario.id);

  // [FIX-5] Poblar el Map con un RegistroDiario por hábito.
  // Antes era siempre un Map vacío — kipToggleHoy nunca podía usar el registro local.
  const registros = new Map(
    habitos.map(h => [h.id, new RegistroDiario(h)])
  );

  return { habitos, registros };
}

/**
 * Alterna el estado completado de un hábito.
 *
 * [FIX-04] Tipado de registros — kipToggleHoy siempre trabaja con
 *          instancias completas de hábito al crear o actualizar registros.
 *
 *          Problema anterior: cuando el habitoId no existía en el Map
 *          (hábito creado después de la carga inicial), se creaba un
 *          RegistroDiario con un objeto parcial { id, completadoHoy }.
 *          Esto rompía cualquier método que esperase un hábito completo
 *          (calcularProgreso, syncCardUI, AnalizadorProgreso, etc.).
 *
 *          Ahora la firma acepta un parámetro opcional `habitosRef` para
 *          que el dashboard pueda pasar el array completo y obtener la
 *          instancia real del hábito. Si no se proporciona (compatibilidad
 *          hacia atrás), se crea un stub mínimo pero tipado correctamente.
 *
 * [FIX-05-prev] Sincroniza el RegistroDiario local después de persistir
 *              en el dataService. Estado en memoria y persistido alineados.
 *
 * @param {string}  habitoId    — id del hábito
 * @param {Map}     registros   — Map<id, RegistroDiario> en memoria
 * @param {object}  dataService — capa de datos
 * @param {Array}   [habitos]   — array completo de hábitos (opcional, mejora tipado)
 * @returns {boolean} nuevo estado de completadoHoy
 */
export async function kipToggleHoy(habitoId, registros, dataService, habitos = []) {
  // Persistir en el dataService (fuente de verdad en producción)
  const nuevoEstado = await dataService.toggleHabito(habitoId);

  // [FIX-04] Obtener la instancia completa del hábito si está disponible
  const habitoCompleto = habitos.find(h => h.id === habitoId) ?? null;

  // Sincronizar el registro local para mantener coherencia en memoria
  let registro = registros.get(habitoId);

  if (!registro) {
    // Hábito creado después de la carga inicial — crear registro al vuelo.
    // [FIX-04] Si tenemos la instancia completa, usarla. Si no, crear un
    // stub con los campos mínimos que RegistroDiario y syncCardUI necesitan.
    const habitoParaRegistro = habitoCompleto ?? {
      id:             habitoId,
      nombre:         '',
      frecuencia:     'diario',
      categoria:      'general',
      nota:           '',
      completadoHoy:  nuevoEstado,
      racha:          0,
      metaSemanal:    3,
      metaMensual:    20,
      // calcularProgreso puede estar ausente en el stub; lo adjuntamos si falta
    };
    // calcularProgreso puede estar ausente en el stub — adjuntarlo para que
    // syncCardUI, DonutRing y AnalizadorProgreso no fallen con TypeError.
    // AnalizadorProgreso ya está importado estáticamente en este módulo.
    if (!habitoParaRegistro.calcularProgreso) {
      AnalizadorProgreso.attachProgreso(habitoParaRegistro);
    }
    registro = new RegistroDiario(habitoParaRegistro);
    registros.set(habitoId, registro);
  } else {
    // [FIX-04] Si tenemos el hábito completo, actualizar la referencia en el
    // registro para que siempre apunte al objeto real y no a un stub parcial.
    if (habitoCompleto && registro.habito !== habitoCompleto) {
      registro.habito = habitoCompleto;
    }
    // Forzar el estado al valor confirmado por el servidor (no toggle ciego)
    registro.completado = nuevoEstado;
    if (registro.habito) registro.habito.completadoHoy = nuevoEstado;
  }

  return nuevoEstado;
}

/**
 * Crea un objeto hábito con los valores por defecto.
 */
export function kipCrearHabito(data = {}) {
  const nuevo = {
    id:            data.id            ?? `h${Date.now()}`,
    nombre:        data.nombre        ?? 'Nuevo hábito',
    frecuencia:    data.frecuencia    ?? 'diario',
    categoria:     data.categoria     ?? 'general',
    nota:          data.nota          ?? '',
    // Respetar el valor del server si lo trae; false solo como fallback
    completadoHoy: data.completadoHoy ?? false,
    racha:         data.racha         ?? 0,
    metaSemanal:   data.metaSemanal   ?? 3,
    metaMensual:   data.metaMensual   ?? 20,
  };
  AnalizadorProgreso.attachProgreso(nuevo); // [FEAT-4]
  return nuevo;
}

/**
 * Construye el HTML completo de una tarjeta de hábito.
 *
 * [FIX-6] Unificado con buildCardHTML de habits.js.
 * Antes la versión del dashboard era un HTML simplificado sin iconos
 * de categoría, nota ni trend badge — generando tarjetas visualmente
 * inconsistentes al añadir un hábito nuevo desde el modal.
 * Ahora ambas páginas usan la misma función y el mismo HTML.
 *
 * [C-02] Todo dato externo (id, nombre, nota, categoria, frecuencia) pasa por esc().
 */

const _CAT_COLORS = {
  bienestar: '#14B8A6', salud: '#F59E0B', mente: '#8B5CF6',
  social: '#F43F5E',    trabajo: '#06B6D4', general: '#10B981',
};
const _CAT_ICON_CLASS = {
  bienestar: 'hci--teal', salud: 'hci--amber', mente: 'hci--violet',
  social: 'hci--rose',   trabajo: 'hci--cyan', general: 'hci--green',
};
const _CAT_ICONS = {
  bienestar: '<path d="M12 4C9 4 7 7 7 9.5c0 4 5 7 5 7s5-3 5-7C17 7 15 4 12 4z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/>',
  salud:     '<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  mente:     '<path d="M9 3C6 3 4 5.5 4 8c0 2.5 1.5 3.5 2 4.5V18h12v-5.5c.5-1 2-2 2-4.5 0-2.5-2-5-5-5-1 0-2 .5-2.5 1.5C11.5 3.5 10 3 9 3z" stroke="currentColor" stroke-width="1.4" fill="none"/>',
  social:    '<circle cx="9" cy="7" r="3" stroke="currentColor" stroke-width="1.4" fill="none"/><circle cx="15" cy="7" r="3" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M3 19c0-3 2.5-5 6-5h6c3.5 0 6 2 6 5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
  trabajo:   '<rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M8 7V5a2 2 0 014 0v2" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
  general:   '<path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/>',
};

export function kipBuildCardHTML(habito, progreso = 0) {
  const cat       = (habito.categoria || 'general').toLowerCase();
  const catColor  = _CAT_COLORS[cat]     || _CAT_COLORS.general;
  const iconClass = _CAT_ICON_CLASS[cat] || _CAT_ICON_CLASS.general;
  const iconPath  = _CAT_ICONS[cat]      || _CAT_ICONS.general;
  const hecho     = habito.completadoHoy;
  const freq      = (habito.frecuencia || 'diario').toLowerCase();
  const pct       = Number(progreso);

  const freqLabel = freq === 'semanal' ? 'Semanal'
                  : freq === 'mensual' ? 'Mensual' : 'Diario';

  let progresoLabel;
  if (freq === 'semanal') {
    const meta = habito.metaSemanal || 3;
    progresoLabel = `${Math.round((pct / 100) * meta)} / ${meta} esta semana`;
  } else if (freq === 'mensual') {
    const meta = habito.metaMensual || 20;
    progresoLabel = `${Math.round((pct / 100) * meta)} / ${meta} este mes`;
  } else {
    progresoLabel = `${Math.round((pct / 100) * 7)} / 7 esta semana`;
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
      <div class="hc-meta"><span class="hc-freq">${freqLabel}</span></div>
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
      <div class="hc-prog-fill" style="--prog:${pct}%"></div>
    </div>
    <div class="hc-prog-stats">
      <span class="hc-prog-label">${progresoLabel}</span>
      <span class="hc-prog-pct">${pct}%</span>
    </div>
  </div>

  <div class="hc-note-wrap" data-note-wrap aria-label="Nota del hábito">
    ${notaHTML}
    <input class="hc-note-edit" type="text" maxlength="80"
           placeholder="Escribe una nota…"
           aria-label="Editar nota de ${esc(habito.nombre)}"
           value="${esc(habito.nota || '')}" />
  </div>

  <div class="hc-ring" data-donut data-id="${esc(habito.id)}" data-prog="${pct}" hidden></div>
</article>`;
}

