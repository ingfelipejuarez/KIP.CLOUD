/**
 * KIP · src/services/KIPStore.js
 * Singleton de estado global compartido entre módulos de página.
 */

// Variable de módulo — compatible con todos los browsers modernos
// Evita private class fields (#) que pueden fallar en algunas herramientas de dev
let _instance = null;

export class KIPStore {
  constructor() {
    this._state = {
      usuario:  null,
      habitos:  [],
      plan:     'FREE',
      nombre:   '',
      tema:     'ember',
    };
    this._listeners = new Set();
  }

  static getInstance() {
    if (!_instance) _instance = new KIPStore();
    return _instance;
  }

  getState() {
    return { ...this._state };
  }

  setState(partial) {
    this._state = { ...this._state, ...partial };
    this._listeners.forEach(fn => fn(this._state));
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }
}
