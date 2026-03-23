/**
 * KIP · src/ui/pages/PageGuard.js
 *
 * [FIX-7] Centraliza los flags de "página ya inicializada" que antes
 * vivían dispersos en window._kipDashboardStarted, window._kipAIStarted, etc.
 *
 * Antes: cada módulo de página declaraba y leía su propio flag en window,
 * sin contrato ni limpieza. Un typo en el nombre del flag o una página
 * montada dos veces dejaba el flag "sucio" para siempre.
 *
 * Ahora: un único registro con métodos claros. Además expone reset()
 * para poder limpiar el estado en tests o en futuros escenarios SPA.
 *
 * Uso:
 *   import { PageGuard } from '../../ui/pages/PageGuard.js';
 *
 *   async function launch() {
 *     if (!PageGuard.claim('dashboard')) return;  // solo continúa una vez
 *     ...
 *   }
 */

// Conjunto de páginas ya inicializadas en esta sesión de navegación
const _started = new Set();

export const PageGuard = {
  /**
   * Intenta "reclamar" la inicialización de una página.
   * Retorna true la primera vez que se llama con ese nombre.
   * Retorna false en todas las llamadas siguientes (la página ya arrancó).
   *
   * @param {string} pageName — identificador único: 'dashboard' | 'habits' |
   *                            'ai' | 'activity' | 'achievements'
   * @returns {boolean}
   */
  claim(pageName) {
    if (_started.has(pageName)) return false;
    _started.add(pageName);
    return true;
  },

  /**
   * Libera el claim de una página — útil para tests o para resetear
   * el estado en futuros escenarios SPA donde las páginas se desmontan.
   *
   * @param {string} pageName
   */
  release(pageName) {
    _started.delete(pageName);
  },

  /**
   * Limpia todos los claims. Útil en tests de integración.
   */
  reset() {
    _started.clear();
  },

  /**
   * Indica si una página ya fue inicializada.
   * @param {string} pageName
   * @returns {boolean}
   */
  isStarted(pageName) {
    return _started.has(pageName);
  },
};
