// KIP · src/services/statsService.js
// Estadísticas de actividad para el dashboard y la página de actividad

import prisma from '../config/db.js';

export const statsService = {

  async getDashboard(userId) {
    const today = todayDate();

    const [habits, todayCompletions] = await Promise.all([
      prisma.habit.findMany({
        where:  { userId, archivado: false },
        select: { id: true, nombre: true, frecuencia: true, categoria: true },
      }),
      prisma.habitCompletion.findMany({
        where:   { userId, fecha: today },
        select:  { habitId: true },
      }),
    ]);

    const completadosHoy = todayCompletions.length;
    const total          = habits.length;

    // Racha máxima actual
    const rachaMaxima = await _maxRachaUsuario(userId);

    // Progreso de la semana (últimos 7 días)
    const semana = await _progresoSemana(userId);

    // Mejor racha histórica
    const mejorRacha = await _mejorRachaHistorica(userId);

    return {
      hoy: { completados: completadosHoy, total },
      rachaActual:  rachaMaxima,
      mejorRacha,
      semana,
    };
  },

  async getActivity(userId, days = 91) {
    const from = daysAgo(days);

    const [completions, totalHabits] = await Promise.all([
      prisma.habitCompletion.findMany({
        where:   { userId, fecha: { gte: from } },
        select:  { fecha: true },
        orderBy: { fecha: 'asc' },
      }),
      prisma.habit.count({ where: { userId, archivado: false } }),
    ]);

    // Agrupar por fecha
    const byDay = {};
    for (const c of completions) {
      const key = c.fecha.toISOString().slice(0, 10);
      byDay[key] = (byDay[key] || 0) + 1;
    }

    // Estadísticas extra
    const diasPerfectos = Object.values(byDay).filter(v => v === totalHabits).length;
    const tasaTotal     = totalHabits > 0 && days > 0
      ? Math.round((completions.length / (totalHabits * days)) * 100)
      : 0;

    // Mejor día de la semana
    const porDia = Array(7).fill(0); // 0=Dom, 1=Lun, …
    for (const c of completions) {
      porDia[new Date(c.fecha).getDay()]++;
    }
    const mejorDiaIdx = porDia.indexOf(Math.max(...porDia));
    const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

    return {
      tasaMensual:   tasaTotal,
      diasPerfectos,
      mejorDia:      dias[mejorDiaIdx],
      peorDia:       dias[porDia.indexOf(Math.min(...porDia))],
      heatmap:       byDay,
      totalHabits,
    };
  },
};

// ── Helpers ───────────────────────────────────────────────────────

function todayDate() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function _maxRachaUsuario(userId) {
  const habits = await prisma.habit.findMany({
    where:  { userId, archivado: false },
    select: { id: true },
  });
  let max = 0;
  for (const h of habits) {
    const r = await _calcularRacha(h.id);
    if (r > max) max = r;
  }
  return max;
}

async function _calcularRacha(habitId) {
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

async function _mejorRachaHistorica(userId) {
  // Calcula la racha más larga ever para cualquier hábito del usuario
  const habits = await prisma.habit.findMany({
    where:  { userId },
    select: { id: true },
  });

  let mejor = 0;
  for (const h of habits) {
    const completions = await prisma.habitCompletion.findMany({
      where:   { habitId: h.id },
      orderBy: { fecha: 'asc' },
      select:  { fecha: true },
    });

    let racha = 0, maxRacha = 0;
    let prev  = null;

    for (const { fecha } of completions) {
      const d = new Date(fecha);
      d.setHours(0, 0, 0, 0);
      if (prev) {
        const diff = (d - prev) / (1000 * 60 * 60 * 24);
        racha = diff === 1 ? racha + 1 : 1;
      } else {
        racha = 1;
      }
      if (racha > maxRacha) maxRacha = racha;
      prev = d;
    }
    if (maxRacha > mejor) mejor = maxRacha;
  }
  return mejor;
}

async function _progresoSemana(userId) {
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);

    const count = await prisma.habitCompletion.count({
      where: { userId, fecha: d },
    });
    const total = await prisma.habit.count({ where: { userId, archivado: false } });

    result.push({
      fecha:      d.toISOString().slice(0, 10),
      completados: count,
      total,
      porcentaje:  total > 0 ? Math.round((count / total) * 100) : 0,
    });
  }
  return result;
}
