/** KIP · NavbarScroll — efecto de scroll en el navbar */
export const NavbarScrollComponent = {
  init() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;
    const update = () => navbar.classList.toggle('navbar--scrolled', window.scrollY > 10);
    window.addEventListener('scroll', update, { passive: true });
    update();
  },
};
