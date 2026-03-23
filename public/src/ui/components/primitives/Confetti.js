/** KIP · Confetti — celebración al completar todos los hábitos */
export const ConfettiComponent = {
  lanzar() {
    const root = document.getElementById('confetti-root') || document.body;
    const colors = ['#F59E0B','#10B981','#8B5CF6','#F43F5E','#06B6D4'];
    for (let i = 0; i < 60; i++) {
      const el = document.createElement('div');
      el.style.cssText = [
        'position:fixed',
        `left:${Math.random() * 100}vw`,
        `top:-10px`,
        `width:${6 + Math.random() * 6}px`,
        `height:${6 + Math.random() * 6}px`,
        `background:${colors[Math.floor(Math.random() * colors.length)]}`,
        'border-radius:2px',
        'pointer-events:none',
        'z-index:9999',
        `animation:confettiFall ${1 + Math.random() * 2}s ease-in forwards`,
        `animation-delay:${Math.random() * .5}s`,
      ].join(';');
      root.appendChild(el);
      setTimeout(() => el.remove(), 3000);
    }
  },
};
