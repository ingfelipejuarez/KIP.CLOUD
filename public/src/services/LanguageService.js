/**
 * KIP · src/services/LanguageService.js
 * Textos localizados y formateo de fechas.
 *
 * [FIX-08] getSaludo() devolvía texto plano sin emoji. El HTML tiene
 *          hardcodeado "Buenos días 👋" como placeholder visible antes
 *          de que JS cargue. Cuando dashboard.js sobreescribía el textContent
 *          con getSaludo(), el emoji desaparecía. Ahora getSaludo() incluye
 *          el emoji contextual para que el texto sea coherente antes y después
 *          de la hidratación.
 */
export class LanguageService {
  getSaludo() {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días 👋';
    if (h < 19) return 'Buenas tardes ☀️';
    return 'Buenas noches 🌙';
  }

  formatFechaHoy() {
    return new Date().toLocaleDateString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
  }

  formatDatetime() {
    return new Date().toISOString().split('T')[0];
  }
}
