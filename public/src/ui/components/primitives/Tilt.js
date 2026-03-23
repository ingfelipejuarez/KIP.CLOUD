/** KIP · Tilt — efecto 3D en hover */
export const TiltComponent = {
  init(selector = '.metric-card') {
    document.querySelectorAll(selector).forEach(el => {
      el.addEventListener('mousemove', (e) => {
        const r    = el.getBoundingClientRect();
        const x    = (e.clientX - r.left) / r.width  - 0.5;
        const y    = (e.clientY - r.top)  / r.height - 0.5;
        el.style.transform = `perspective(600px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg)`;
      });
      el.addEventListener('mouseleave', () => {
        el.style.transform = '';
      });
    });
  },
};
