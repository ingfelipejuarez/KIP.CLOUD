/**
 * KIP · src/core/models/Badge.js
 * Modelo de un badge/logro del usuario.
 */
export class Badge {
  constructor(data = {}) {
    this.id           = data.id           ?? '';
    this.nombre       = data.nombre       ?? '';
    this.descripcion  = data.descripcion  ?? '';
    this.desbloqueado = data.desbloqueado ?? false;
    this.fechaLogro   = data.fechaLogro   ?? null;
  }
}
