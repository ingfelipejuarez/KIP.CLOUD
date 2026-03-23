// KIP · src/services/badgeService.js
// Evalúa y otorga badges automáticamente cuando el usuario completa hábitos

import prisma from '../config/db.js';

export const badgeService = {

  async getAll(userId) {
    const [defs, earned] = await Promise.all([
      prisma.badgeDefinition.findMany({ orderBy: { metaValor: 'asc' } }),
      prisma.userBadge.findMany({
        where: { userId },
        select: { badgeId: true, fechaLogro: true },
      }),
    ]);

    const earnedMap = new Map(earned.map(e => [e.badgeId, e.fechaLogro]));

    return defs.map(def => ({
      id:           def.id,
      nombre:       def.nombre,
      descripcion:  def.descripcion,
      icono:        def.icono,
      desbloqueado: earnedMap.has(def.id),
      fechaLogro:   earnedMap.get(def.id) || null,
      metaValor:    def.metaValor,
      metaTipo:     def.metaTipo,
    }));
  },

  /**
   * Evalúa si el usuario merece nuevos badges y los otorga.
   * Se llama automáticamente tras cada toggle de completado.
   */
  async evaluarBadges(userId) {
    const [defs, earned, habits] = await Promise.all([
      prisma.badgeDefinition.findMany(),
      prisma.userBadge.findMany({ where: { userId }, select: { badgeId: true } }),
      prisma.habit.findMany({ where: { userId, archivado: false } }),
    ]);

    const earnedIds = new Set(earned.map(e => e.badgeId));
    const toEarn    = [];

    for (const def of defs) {
      if (earnedIds.has(def.id)) continue; // ya tiene este badge

      const merece = await this._evaluar(def, userId, habits);
      if (merece) toEarn.push(def.id);
    }

    if (toEarn.length > 0) {
      await prisma.userBadge.createMany({
        data: toEarn.map(badgeId => ({ userId, badgeId })),
        skipDuplicates: true,
      });
    }

    return toEarn; // IDs de badges recién ganados
  },

  async _evaluar(def, userId, habits) {
    switch (def.metaTipo) {
      case 'racha': {
        // ¿Algún hábito tiene racha >= metaValor?
        const maxRacha = await _maxRacha(userId);
        return maxRacha >= (def.metaValor || 0);
      }
      case 'habitos_activos': {
        return habits.length >= (def.metaValor || 0);
      }
      case 'categorias': {
        const cats = new Set(habits.map(h => h.categoria));
        return cats.size >= (def.metaValor || 0);
      }
      case 'semana_perfecta': {
        return await _semanaCompleta(userId);
      }
      case 'madrugador':
      case 'antes_mediodia': {
        // Requeriría timestamp de completado — simplificado: verificar conteo
        return false; // implementar cuando se añada hora al toggle
      }
      default:
        return false;
    }
  },
};

async function _maxRacha(userId) {
  // Racha máxima entre todos los hábitos del usuario
  const habits = await prisma.habit.findMany({
    where: { userId, archivado: false },
    select: { id: true },
  });

  let max = 0;
  for (const h of habits) {
    const racha = await _rachaHabit(h.id);
    if (racha > max) max = racha;
  }
  return max;
}

async function _rachaHabit(habitId) {
  const completions = await prisma.habitCompletion.findMany({
    where:   { habitId },
    orderBy: { fecha: 'desc' },
    select:  { fecha: true },
  });
  if (!completions.length) return 0;

  let racha = 0;
  let expected = new Date();
  expected.setHours(0, 0, 0, 0);

  for (const { fecha } of completions) {
    const d = new Date(fecha);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() === expected.getTime()) {
      racha++;
      expected.setDate(expected.getDate() - 1);
    } else break;
  }
  return racha;
}

async function _semanaCompleta(userId) {
  // Verifica que los últimos 7 días tengan al menos un completado
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    days.push(d);
  }

  const counts = await prisma.habitCompletion.groupBy({
    by: ['fecha'],
    where: { userId, fecha: { in: days } },
    _count: { _all: true },
  });

  return counts.length === 7;
}
