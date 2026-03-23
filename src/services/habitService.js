// KIP · src/services/habitService.js
// Lógica de negocio de hábitos, completados y rachas

import prisma from '../config/db.js';
import { createError } from '../middleware/errorHandler.js';
import { badgeService } from './badgeService.js';

export const habitService = {

  // ── CRUD ──────────────────────────────────────────────────────

  async getAll(userId) {
    const habits = await prisma.habit.findMany({
      where:   { userId, archivado: false },
      orderBy: [{ orden: 'asc' }, { createdAt: 'asc' }],
    });

    const today = todayDate();

    // Para cada hábito: verificar si está completado hoy y calcular racha
    const results = await Promise.all(habits.map(async h => {
      const completadoHoy = await isCompletedOn(h.id, today);
      const racha         = await calcularRacha(h.id);
      return serializeHabit(h, completadoHoy, racha);
    }));

    return results;
  },

  async getById(userId, habitId) {
    const habit = await prisma.habit.findFirst({
      where: { id: habitId, userId, archivado: false },
    });
    if (!habit) throw createError(404, 'Hábito no encontrado');

    const today        = todayDate();
    const completadoHoy = await isCompletedOn(habit.id, today);
    const racha         = await calcularRacha(habit.id);
    return serializeHabit(habit, completadoHoy, racha);
  },

  async create(userId, data) {
    const habit = await prisma.habit.create({
      data: {
        userId,
        nombre:      data.nombre,
        frecuencia:  data.frecuencia  || 'DIARIO',
        categoria:   data.categoria   || 'GENERAL',
        nota:        data.nota        || null,
        metaSemanal: data.metaSemanal || null,
        metaMensual: data.metaMensual || null,
      },
    });
    return serializeHabit(habit, false, 0);
  },

  async update(userId, habitId, data) {
    await assertOwns(userId, habitId);
    const habit = await prisma.habit.update({
      where: { id: habitId },
      data,
    });
    const racha = await calcularRacha(habit.id);
    const completadoHoy = await isCompletedOn(habit.id, todayDate());
    return serializeHabit(habit, completadoHoy, racha);
  },

  async archive(userId, habitId) {
    await assertOwns(userId, habitId);
    await prisma.habit.update({
      where: { id: habitId },
      data:  { archivado: true },
    });
  },

  async delete(userId, habitId) {
    await assertOwns(userId, habitId);
    await prisma.habit.delete({ where: { id: habitId } });
  },

  async reorder(userId, orderedIds) {
    // Verificar que todos los IDs pertenecen al usuario
    const habits = await prisma.habit.findMany({
      where: { userId, id: { in: orderedIds } },
      select: { id: true },
    });
    if (habits.length !== orderedIds.length) {
      throw createError(400, 'IDs de hábitos inválidos');
    }
    // Actualizar el campo orden en bulk
    await prisma.$transaction(
      orderedIds.map((id, idx) =>
        prisma.habit.update({ where: { id }, data: { orden: idx } })
      )
    );
  },

  // ── Toggle completado ─────────────────────────────────────────

  async toggle(userId, habitId) {
    await assertOwns(userId, habitId);

    const today    = todayDate();
    const existing = await prisma.habitCompletion.findUnique({
      where: { habitId_fecha: { habitId, fecha: today } },
    });

    let completadoHoy;
    if (existing) {
      // Ya estaba completado → desmarcar
      await prisma.habitCompletion.delete({
        where: { habitId_fecha: { habitId, fecha: today } },
      });
      completadoHoy = false;
    } else {
      // No estaba completado → marcar
      await prisma.habitCompletion.create({
        data: { habitId, userId, fecha: today },
      });
      completadoHoy = true;

      // Evaluar badges tras completar
      await badgeService.evaluarBadges(userId);
    }

    const racha = await calcularRacha(habitId);
    return { completadoHoy, racha };
  },

  // ── Historial para el heatmap ─────────────────────────────────

  async getHistory(userId, days = 91) {
    const from = new Date();
    from.setDate(from.getDate() - days);
    from.setHours(0, 0, 0, 0);

    const completions = await prisma.habitCompletion.findMany({
      where:   { userId, fecha: { gte: from } },
      select:  { fecha: true, habitId: true },
      orderBy: { fecha: 'asc' },
    });

    const totalHabits = await prisma.habit.count({
      where: { userId, archivado: false },
    });

    // Agrupar por día: { "2025-01-01": 3, ... }
    const byDay = {};
    for (const c of completions) {
      const key = c.fecha.toISOString().slice(0, 10);
      byDay[key] = (byDay[key] || 0) + 1;
    }

    // Convertir a array de { fecha, completados, total, level }
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key         = d.toISOString().slice(0, 10);
      const completados = byDay[key] || 0;
      const proporcion  = totalHabits > 0 ? completados / totalHabits : 0;
      const level       = proporcion === 0 ? 0
                        : proporcion < 0.25 ? 1
                        : proporcion < 0.50 ? 2
                        : proporcion < 0.75 ? 3 : 4;
      result.push({ fecha: key, completados, total: totalHabits, level });
    }
    return result;
  },
};

// ── Helpers internos ──────────────────────────────────────────────

function todayDate() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function isCompletedOn(habitId, fecha) {
  const r = await prisma.habitCompletion.findUnique({
    where: { habitId_fecha: { habitId, fecha } },
  });
  return Boolean(r);
}

/**
 * Calcula la racha actual: días consecutivos completados hasta hoy.
 */
async function calcularRacha(habitId) {
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
    } else if (d.getTime() < expected.getTime()) {
      break; // hueco en la racha
    }
  }
  return racha;
}

async function assertOwns(userId, habitId) {
  const habit = await prisma.habit.findFirst({
    where: { id: habitId, userId },
    select: { id: true },
  });
  if (!habit) throw createError(404, 'Hábito no encontrado');
}

function serializeHabit(habit, completadoHoy, racha) {
  return {
    id:          habit.id,
    nombre:      habit.nombre,
    frecuencia:  habit.frecuencia.toLowerCase(),
    categoria:   habit.categoria.toLowerCase(),
    nota:        habit.nota || '',
    metaSemanal: habit.metaSemanal || null,
    metaMensual: habit.metaMensual || null,
    archivado:   habit.archivado,
    orden:       habit.orden,
    completadoHoy,
    racha,
    createdAt:   habit.createdAt,
  };
}
