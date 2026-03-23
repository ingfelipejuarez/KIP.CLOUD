import { KIP_EVENTS } from '../../events.js';
/** KIP · CategoryFilter — filtrado por categoría */
export const CategoryFilterComponent = {
  init() {
    const container = document.getElementById('cat-filters');
    if (!container) return;
    container.addEventListener('click', (e) => {
      const pill = e.target.closest('.cat-pill');
      if (!pill) return;
      container.querySelectorAll('.cat-pill').forEach(p => {
        p.classList.remove('cat-pill--active');
        p.setAttribute('aria-pressed', 'false');
      });
      pill.classList.add('cat-pill--active');
      pill.setAttribute('aria-pressed', 'true');
      const filter = pill.dataset.filter || 'all';
      window.dispatchEvent(new CustomEvent(KIP_EVENTS.FILTER_CHANGED, { detail: { filter } }));
    });
  },
};
