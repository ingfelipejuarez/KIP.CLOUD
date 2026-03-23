/**
 * KIP · src/services/DataService.js
 * Capa de acceso a datos — abstrae localStorage (mock) vs API REST (prod).
 */
import { KIP_CONFIG }        from '../config.js';
import { AnalizadorProgreso } from '../core/models/AnalizadorProgreso.js';

class MockDataService {
  constructor() {
    this._habitos = this._loadHabitos();
    this._badges  = this._defaultBadges();
  }

  _loadHabitos() {
    try {
      const raw = localStorage.getItem('kip_habitos');
      if (raw) {
        const habitos = JSON.parse(raw);
        // [FIX-B2] Restaurar calcularProgreso() que JSON.stringify() eliminó.
        // Las funciones no se serializan — hay que volver a adjuntarlas.
        return habitos.map(h => AnalizadorProgreso.attachProgreso(h));
      }
    } catch (_) {}
    return this._defaultHabitos();
  }

  _saveHabitos() {
    try { localStorage.setItem('kip_habitos', JSON.stringify(this._habitos)); } catch (_) {}
  }

  _defaultHabitos() {
    return [
      { id: 'h1', nombre: 'Meditación',  frecuencia: 'diario',  categoria: 'bienestar', nota: '10 min antes de dormir',   completadoHoy: true,  racha: 14 },
      { id: 'h2', nombre: 'Ejercicio',   frecuencia: 'diario',  categoria: 'salud',     nota: '30 min — cardio o fuerza', completadoHoy: false, racha: 7  },
      { id: 'h3', nombre: 'Lectura',     frecuencia: 'diario',  categoria: 'mente',     nota: '20 páginas de no-ficción', completadoHoy: false, racha: 3  },
      { id: 'h4', nombre: 'Journaling',  frecuencia: 'semanal', categoria: 'mente',     nota: 'Reflexión del día',        completadoHoy: false, racha: 2,  metaSemanal: 3 },
      { id: 'h5', nombre: 'Hidratación', frecuencia: 'diario',  categoria: 'salud',     nota: '2 litros de agua',         completadoHoy: false, racha: 0  },
      { id: 'h6', nombre: 'Sin redes',   frecuencia: 'diario',  categoria: 'bienestar', nota: 'Antes de las 9am',         completadoHoy: false, racha: 5  },
    ];
  }

  _defaultBadges() {
    return [
      // ── Desbloqueados ────────────────────────────────────────────
      { id: 'b1', nombre: 'Primera semana',   descripcion: 'Completaste 7 días seguidos. ¡El comienzo de algo grande!', desbloqueado: true  },
      { id: 'b2', nombre: 'Constancia solar', descripcion: 'Racha de 14 días. El sol sale para quien madurga.',         desbloqueado: true  },
      // ── Bloqueados ───────────────────────────────────────────────
      { id: 'b3', nombre: 'Hábito forjado',   descripcion: '21 días sin parar. La ciencia dice que ya es un hábito.',   desbloqueado: false },
      { id: 'b4', nombre: 'Mes completo',     descripcion: 'Racha de 30 días. Un mes entero de disciplina.',            desbloqueado: false },
      { id: 'b5', nombre: 'Racha de fuego',   descripcion: 'Racha de 50 días. La llama no se apaga.',                  desbloqueado: false },
      { id: 'b6', nombre: 'Maestro del hábito', descripcion: '100 días seguidos. Eres un ejemplo a seguir.',           desbloqueado: false },
      { id: 'b7', nombre: 'Madrugador',       descripcion: 'Completa un hábito antes de las 8am 5 veces.',             desbloqueado: false },
      { id: 'b8', nombre: 'Multitarea',       descripcion: 'Ten 5 o más hábitos activos al mismo tiempo.',             desbloqueado: false },
      { id: 'b9', nombre: 'Sin excusas',      descripcion: 'No pierdas ni un solo día en una semana completa.',        desbloqueado: false },
      { id: 'b10', nombre: 'Velocista',       descripcion: 'Completa todos tus hábitos antes del mediodía.',           desbloqueado: false },
      { id: 'b11', nombre: 'Explorador',      descripcion: 'Crea hábitos en 4 categorías distintas.',                  desbloqueado: false },
      { id: 'b12', nombre: 'Leyenda',         descripcion: 'Racha de 365 días. Un año entero sin rendirse.',           desbloqueado: false },
    ];
  }

  // [FEAT-4] attachProgreso garantiza que cada hábito tenga calcularProgreso
  // desde la lógica centralizada en AnalizadorProgreso.
  async getHabitos(userId) {
    // [E-04] Excluir hábitos archivados de la vista normal
    return this._habitos
      .filter(h => !h.archivado)
      .map(h => AnalizadorProgreso.attachProgreso(h));
  }

  async toggleHabito(habitoId) {
    const h = this._habitos.find(h => h.id === habitoId);
    if (!h) throw new Error(`Hábito ${habitoId} no encontrado`);

    const wasCompleted = h.completadoHoy;
    h.completadoHoy = !wasCompleted;

    // [FIX-M1] Actualizar racha al marcar/desmarcar.
    // En producción la racha la calcularía el backend con historial real.
    // En mock: +1 al completar, -1 al desmarcar (mínimo 0).
    if (h.completadoHoy) {
      h.racha = (h.racha ?? 0) + 1;
    } else {
      h.racha = Math.max(0, (h.racha ?? 0) - 1);
    }

    // Invalidar caché de progreso — la racha cambió
    AnalizadorProgreso.invalidateCache();

    this._saveHabitos();
    return h.completadoHoy;
  }

  async createHabito(data) {
    const nuevo = {
      id: `h${Date.now()}`,
      nombre: data.nombre, frecuencia: data.frecuencia || 'diario',
      categoria: data.categoria || 'general', nota: data.nota || '',
      completadoHoy: false, racha: 0,
      metaSemanal: data.metaSemanal, metaMensual: data.metaMensual,
    };
    AnalizadorProgreso.attachProgreso(nuevo); // [FEAT-4]
    this._habitos.push(nuevo);
    this._saveHabitos();
    return nuevo;
  }

  async updateHabito(habitoId, cambios) {
    const h = this._habitos.find(h => h.id === habitoId);
    if (h) Object.assign(h, cambios);
    this._saveHabitos();
    return h;
  }

  async deleteHabito(habitoId) {
    this._habitos = this._habitos.filter(h => h.id !== habitoId);
    this._saveHabitos();
  }

  // [E-04] Archivar — oculta el hábito sin eliminarlo permanentemente
  async archiveHabito(habitoId) {
    const h = this._habitos.find(h => h.id === habitoId);
    if (h) {
      h.archivado = true;
      this._saveHabitos();
    }
  }

  async getBadges(userId) { return [...this._badges]; }
}

export function createDataService() {
  return new MockDataService();
}
