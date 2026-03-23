/** KIP · Skeleton — loading placeholder */
export const SkeletonComponent = {
  activar(selector) {
    document.querySelectorAll(selector).forEach(el => el.classList.add('skeleton'));
  },
  desactivar(selector, delay = 0) {
    setTimeout(() => {
      document.querySelectorAll(selector).forEach(el => el.classList.remove('skeleton'));
    }, delay);
  },
};
