/**
 * KIP · src/kip-stub.js
 *
 * Stubs SÍNCRONOS que deben estar disponibles ANTES que cualquier módulo ES
 * o script externo del servidor de desarrollo (errors-boot.js de Vite, etc.).
 *
 * Se carga con <script src="..."> SIN defer/async — garantiza ejecución
 * síncrona antes de los módulos. Cubierto por CSP 'self' sin necesitar hash.
 *
 * bootstrap.js (módulo ES) reemplazará window.KIPStore con la instancia real
 * una vez que el grafo de módulos se evalúe.
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
  // [FIX-06] initArchivePersistence y toggleRegistroPersistente eran llamadas
  //          por scripts inyectados por el servidor de desarrollo (Vite/Live Server)
  //          antes de que ningún módulo ES las definiera → ReferenceError en boot.
  //          Añadirlas aquí garantiza que estén disponibles síncronamente desde
  //          el primer script que se ejecute, sin necesidad de import.
  [
    'initNotaPersistence',
    'initArchivePersistence',
    'toggleRegistroPersistente',
    'kipSyncData',
    'kipTrackEvent',
    'kipOnReady',
    'kipAnalytics',
  ].forEach(function (name) {
    if (typeof window[name] === 'undefined') window[name] = function () {};
  });

  // ── Tema: aplicar antes del primer paint para evitar flash ────
  try {
    var t = localStorage.getItem('kip_tema') || localStorage.getItem('kip-v4-tema');
    if (t) document.documentElement.setAttribute('data-theme', t);
  } catch (_) {}
})();
