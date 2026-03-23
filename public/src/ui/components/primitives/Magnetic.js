/** KIP · Magnetic — botones magnéticos en hover */
export const MagneticComponent = {
  init(selector = '.js-magnetic') {
    document.querySelectorAll(selector).forEach(el => {
      el.addEventListener('mousemove', (e) => {
        const r  = el.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width  / 2)) * 0.3;
        const dy = (e.clientY - (r.top  + r.height / 2)) * 0.3;
        el.style.transform = `translate(${dx}px, ${dy}px)`;
      });
      el.addEventListener('mouseleave', () => {
        el.style.transform = '';
      });
    });
  },
};
