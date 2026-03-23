/**
 * KIP · src/services/AuthService.js
 * Gestión del usuario autenticado — carga, cacheo y métodos de usuario.
 *
 * [FIX-02] calcularRacha() fallaba con 0 porque Usuario._habitos siempre
 *          estaba vacío. El array se rellenaba en KIPStore después de que
 *          el dashboard ya había llamado a calcularRacha().
 *
 *          Solución: AuthService expone sincronizarHabitos(habitos) para
 *          que dashboard.js lo llame justo después de kipLoadHabits(),
 *          antes de cualquier llamada a calcularRacha() o renderMetrica().
 *          KIPStore también llama sincronizarHabitos() al hacer setState()
 *          con un array de hábitos, manteniendo ambos en sintonía.
 */
import { KIP_CONFIG } from '../config.js';

class Usuario {
  constructor(data = {}) {
    this.id     = data.id     ?? 'mock-user-1';
    this.nombre = data.nombre ?? this._nombreFromStorage();
    this.email  = data.email  ?? '';
    this.plan   = data.plan   ?? 'FREE';
    this._habitos = [];
    this._badges  = [];
  }

  _nombreFromStorage() {
    try {
      let v = localStorage.getItem(KIP_CONFIG.KEYS.NOMBRE) || 'Usuario';
      // [FIX-NOMBRE] Versiones anteriores guardaban el nombre con
      // JSON.stringify(), lo que producía '"Felipe"' (con comillas literales).
      // Detectar y limpiar ese formato para no mostrar las comillas en la UI.
      if (v.startsWith('"') && v.endsWith('"')) {
        try { v = JSON.parse(v); } catch (_) { v = v.slice(1, -1); }
      }
      return v || 'Usuario';
    } catch { return 'Usuario'; }
  }

  /**
   * [FIX-02] Racha real: máximo de todas las rachas individuales.
   * Antes devolvía 0 porque this._habitos estaba vacío en el momento
   * en que se llamaba. Ahora el array se sincroniza mediante
   * AuthService.sincronizarHabitos() antes del primer render.
   */
  calcularRacha() {
    if (!this._habitos.length) return 0;
    return Math.max(...this._habitos.map(h => h.racha ?? 0), 0);
  }

  agregarHabito(habito) { this._habitos.push(habito); }
  agregarBadge(badge)   { this._badges.push(badge); }
}

export class AuthService {
  constructor(dataService) {
    this._ds      = dataService;
    this._usuario = null;
  }

  async inicializar() {
    this._usuario = new Usuario();
    return this._usuario;
  }

  getUsuario() { return this._usuario; }

  /**
   * [FIX-02] Sincroniza el array de hábitos dentro del objeto Usuario.
   *
   * Debe llamarse inmediatamente después de resolver kipLoadHabits(),
   * antes de renderMetrica() o ShareStreakComponent.init().
   * Reemplaza el array interno en lugar de hacer push() para evitar
   * duplicados en re-renders o llamadas múltiples.
   *
   * @param {Array} habitos — array plano de objetos hábito cargados desde dataService
   */
  sincronizarHabitos(habitos = []) {
    if (!this._usuario) {
      console.warn('[AuthService] sincronizarHabitos() llamado antes de inicializar()');
      return;
    }
    // Reemplazar completamente para evitar duplicados en hot-reload / re-renders
    this._usuario._habitos = [...habitos];
    console.debug('[AuthService] hábitos sincronizados con Usuario →', habitos.length);
  }
}
