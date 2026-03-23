/**
 * KIP · src/core/models/RegistroDiario.js
 * Mantiene el registro de completados de un hábito en la sesión actual.
 */
export class RegistroDiario {
  constructor(habito) {
    this.habito    = habito;
    this.completado = habito?.completadoHoy ?? false;
  }

  toggle() {
    this.completado = !this.completado;
    if (this.habito) this.habito.completadoHoy = this.completado;
    return this.completado;
  }

  estaCompleto() {
    return this.completado;
  }
}
