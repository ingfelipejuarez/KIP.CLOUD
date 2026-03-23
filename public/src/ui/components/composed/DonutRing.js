/** KIP · DonutRing — anillo de progreso SVG */
export const DonutRingComponent = {
  initAll() {
    document.querySelectorAll('[data-donut]').forEach(el => this._inject(el));
  },
  _inject(el) {
    const prog = parseFloat(el.dataset.prog ?? 0);
    const r    = 14, cx = 16, cy = 16;
    const circ = 2 * Math.PI * r;
    const dash = circ * Math.min(Math.max(prog, 0), 100) / 100;
    // [FIX-11] transform="rotate(-90)" rota el punto de inicio al top (12h).
    // stroke-dashoffset se mantiene en 0 — la rotación SVG ya lo posiciona correctamente.
    el.innerHTML = `<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--ring-track)" stroke-width="3"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--a)" stroke-width="3"
        stroke-dasharray="${dash.toFixed(2)} ${circ.toFixed(2)}"
        stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"/>
    </svg>`;
    el.removeAttribute('hidden');
  },
  update(habitoId, progreso) {
    const el = document.querySelector(`[data-donut][data-id="${habitoId}"]`);
    if (el) { el.dataset.prog = progreso; this._inject(el); }
  },
};
