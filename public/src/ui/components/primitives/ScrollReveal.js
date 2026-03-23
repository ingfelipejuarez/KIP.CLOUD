/** KIP · ScrollReveal — animación al entrar en viewport */
export const ScrollRevealComponent = {
  init(selector = '.section, .metric-card, .habit-card') {
    if (!('IntersectionObserver' in window)) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('revealed');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll(selector).forEach(el => obs.observe(el));
  },
};
