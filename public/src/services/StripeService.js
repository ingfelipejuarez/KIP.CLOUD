/**
 * KIP · src/services/StripeService.js
 * Integración con Stripe para pagos (stub hasta conectar backend).
 */
export const StripeService = {
  async handleReturn({ store, usuario } = {}) {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('stripe_result');
    if (result === 'success') {
      // Limpiar param de la URL sin recargar
      const url = new URL(window.location.href);
      url.searchParams.delete('stripe_result');
      history.replaceState({}, '', url);
      return 'success';
    }
    if (result === 'cancel') {
      const url = new URL(window.location.href);
      url.searchParams.delete('stripe_result');
      history.replaceState({}, '', url);
      return 'cancel';
    }
    return null;
  },

  async createCheckoutSession(priceId) {
    // TODO: llamar al backend para crear sesión de Stripe
    console.warn('[StripeService] Backend no conectado — redireccionando a página de demo');
    return null;
  },
};
