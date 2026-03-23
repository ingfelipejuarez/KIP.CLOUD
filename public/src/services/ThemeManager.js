/**
 * KIP · src/services/ThemeManager.js
 * Singleton que gestiona el tema visual de la app.
 */
import { KIP_CONFIG } from '../config.js';

let _themeInstance = null;

export class ThemeManager {
  static getInstance() {
    if (!_themeInstance) _themeInstance = new ThemeManager();
    return _themeInstance;
  }

  cargarGuardado() {
    try {
      const tema = localStorage.getItem(KIP_CONFIG.KEYS.TEMA) || 'ember';
      document.documentElement.setAttribute('data-theme', tema);
    } catch (_) {}
  }

  aplicar(tema) {
    document.documentElement.setAttribute('data-theme', tema);
    try { localStorage.setItem(KIP_CONFIG.KEYS.TEMA, tema); } catch (_) {}
  }

  getTemaActual() {
    return document.documentElement.getAttribute('data-theme') || 'ember';
  }
}
