/**
 * KIP · src/kip-compat.js
 *
 * Script de compatibilidad — se carga SÍNCRONO, ANTES que los módulos ES.
 * Sin defer ni async: garantiza que window.* esté disponible cuando
 * errors-boot.js (del hosting) y otros scripts externos lo necesiten.
 *
 * bootstrap.js (módulo ES) reemplaza window.KIPStore con la instancia real.
 *
 * [FIX-07] Sincronizado con kip-stub.js: ambos archivos deben declarar
 *          exactamente el mismo conjunto de stubs para cubrir cualquier
 *          orden de carga posible. Si kip-stub.js falla o no se carga,
 *          kip-compat.js actúa como red de seguridad y viceversa.
 */
(function () {

  // ── KIPStore stub ─────────────────────────────────────────────
  if (typeof window.KIPStore === 'undefined') {
    window.KIPStore = {
      _stub:       true,
      getInstance: function () { return null; },
      getState:    function () { return {}; },
      setState:    function () {},
      subscribe:   function () { return function () {}; },
    };
  }

  // ── Stubs para funciones que errors-boot.js / persistence-boot.js esperan ─
  // [FIX-07] Añadidos initArchivePersistence y toggleRegistroPersistente,
  //          que persistence-boot.js llama antes de que cualquier módulo ES
  //          los defina. Sin estos stubs → ReferenceError en boot.
  var _stubs = [
    'initNotaPersistence',
    'initArchivePersistence',
    'toggleRegistroPersistente',
    'kipSyncData',
    'kipTrackEvent',
    'kipOnReady',
    'kipAnalytics',
  ];
  _stubs.forEach(function (name) {
    if (typeof window[name] === 'undefined') {
      window[name] = function () {};
    }
  });

})();
