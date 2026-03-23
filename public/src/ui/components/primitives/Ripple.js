/** KIP · Ripple — efecto de onda en botones */
export const RippleComponent = {
  disparar(el, event) {
    if (!el) return;
    const existing = el.querySelector('.ripple');
    existing?.remove();
    const circle = document.createElement('span');
    circle.className = 'ripple';
    circle.style.cssText =
      'position:absolute;border-radius:50%;background:rgba(255,255,255,.3);' +
      'width:32px;height:32px;transform:scale(0);animation:ripple .4s linear;pointer-events:none;';
    el.style.position = 'relative';
    el.style.overflow = 'hidden';
    el.appendChild(circle);
    circle.addEventListener('animationend', () => circle.remove(), { once: true });
  },
};
