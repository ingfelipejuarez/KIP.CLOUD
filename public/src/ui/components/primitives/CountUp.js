/**
 * KIP · CountUp — animación numérica
 *
 * [FIX-09] Protección contra NaN: parseInt("–") o parseInt("") devuelve NaN,
 *          lo que hacía que la animación saltara a valores incorrectos.
 *          Ahora el valor inicial se normaliza a 0 si no es un número válido.
 *          También elimina la clase 'skeleton' del elemento antes de animar,
 *          para que los metric-cards que usan skeleton como placeholder
 *          de carga se "desvelen" correctamente con la animación.
 */
export const CountUpComponent = {
  animar(el, from, to, duration = 600) {
    if (!el) return;
    // [FIX-09] Eliminar skeleton placeholder antes de animar
    el.classList.remove('skeleton');
    // [FIX-09] Normalizar 'from' — puede ser NaN si el textContent era "–" o ""
    const safeFrom = Number.isFinite(from) ? from : 0;
    const safeTo   = Number.isFinite(to)   ? to   : 0;
    const start    = performance.now();
    const diff     = safeTo - safeFrom;
    const tick = (now) => {
      const elapsed  = Math.min(now - start, duration);
      const progress = elapsed / duration;
      const ease     = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      el.textContent = String(Math.round(safeFrom + diff * ease));
      if (elapsed < duration) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
};
