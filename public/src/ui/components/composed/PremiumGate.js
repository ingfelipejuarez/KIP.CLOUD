/** KIP · PremiumGate — bloqueo de funciones Premium */
export const PremiumGateComponent = {
  init(store) {
    const gate = document.getElementById('ai-premium-gate');
    if (!gate) return;
    const state = store?.getState?.() ?? {};
    const isPremium = (state.plan || 'FREE').toUpperCase() === 'PREMIUM';
    gate.hidden = isPremium;
  },
};
