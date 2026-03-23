/**
 * KIP · src/core/models/AnalizadorProgreso.js
 *
 * Calcula estadísticas de progreso a partir del array de hábitos.
 *
 * [FEAT-3] Añadido cacheo por referencia de array.
 * En dashboard.js, analizarHoy() se llamaba hasta 3 veces por tick
 * (en renderMetrica, en el handler de toggle y al inicializar ShareStreak)
 * con el mismo array de hábitos. Ahora el resultado se cachea mientras
 * la referencia del array no cambie, eliminando iteraciones redundantes.
 *
 * El caché se invalida automáticamente cuando:
 *   a) Se pasa un array diferente (nueva referencia).
 *   b) Se llama a invalidateCache() explícitamente (tras un toggle).
 */

let _cache = null; // { ref: Array, result: object } | null

export const AnalizadorProgreso = {

  /**
   * Analiza el progreso de hoy.
   *
   * [FEAT-3] Resultado cacheado por referencia de array.
   * Llama a invalidateCache() después de mutar el array (toggle, nuevo hábito).
   *
   * @param {Array} habitos
   * @returns {{ completados: number, total: number, porcentaje: number }}
   */
  analizarHoy(habitos = []) {
    // Hit de caché: mismo array, sin mutaciones declaradas
    if (_cache && _cache.ref === habitos) {
      return _cache.result;
    }

    const total       = habitos.length;
    const completados = habitos.filter(h => h.completadoHoy).length;
    const porcentaje  = total > 0 ? Math.round((completados / total) * 100) : 0;
    const result      = { completados, total, porcentaje };

    _cache = { ref: habitos, result };
    return result;
  },

  /**
   * Invalida el caché manualmente.
   * Llamar después de cualquier mutación del array de hábitos:
   * toggle, crear, editar, eliminar.
   *
   * @example
   *   habito.completadoHoy = nuevoEstado;
   *   AnalizadorProgreso.invalidateCache();
   *   renderMetrica(habitos, usuario);
   */
  invalidateCache() {
    _cache = null;
  },

  /**
   * Calcula el porcentaje de progreso semanal de un hábito.
   *
   * [FEAT-4] Extraído de los objetos de datos (DataService, kipCrearHabito)
   * donde vivía como función hardcodeada. Centralizar aquí permite que la
   * lógica de progreso sea testeable y consistente en todo el proyecto.
   *
   * @param {object} habito — objeto hábito con racha y frecuencia
   * @returns {number} porcentaje 0-100
   */
  calcularProgreso(habito) {
    if (!habito) return 0;
    const racha = habito.racha ?? 0;
    const freq  = (habito.frecuencia || 'diario').toLowerCase();

    if (freq === 'semanal') {
      const meta = habito.metaSemanal || 3;
      // [B-13] racha % 7 devuelve 0 cuando racha es múltiplo de 7 (7, 14, 21…),
      //        haciendo que un usuario con racha perfecta muestre 0% de progreso.
      // Corrección: interpretar racha como días totales completados y calcular
      // cuántos de esos caen en la semana actual (racha mod 7, pero 0 → 7 si es exacto).
      const diasEstaSemana = racha === 0 ? 0 : ((racha - 1) % 7) + 1;
      return Math.min(Math.round((diasEstaSemana / meta) * 100), 100);
    }
    if (freq === 'mensual') {
      const meta = habito.metaMensual || 20;
      return Math.min(Math.round((racha / meta) * 100), 100);
    }
    // Diario: progreso de los últimos 7 días (racha / 7)
    return Math.min(Math.round((Math.min(racha, 7) / 7) * 100), 100);
  },

  /**
   * Crea y adjunta calcularProgreso() a un objeto hábito.
   * Usar al crear o cargar hábitos para garantizar que la función
   * siempre esté presente y use la lógica centralizada.
   *
   * @param {object} habito
   * @returns {object} el mismo habito con calcularProgreso adjunto
   */
  attachProgreso(habito) {
    habito.calcularProgreso = () => this.calcularProgreso(habito);
    return habito;
  },

  /**
   * Evalúa el estado general del progreso.
   * @param {number} porcentaje — 0..100
   * @returns {'bueno'|'regular'|'bajo'}
   */
  evaluarEstado(porcentaje) {
    if (porcentaje >= 80) return 'bueno';
    if (porcentaje >= 50) return 'regular';
    return 'bajo';
  },
};
