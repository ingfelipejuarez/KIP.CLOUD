// KIP · src/services/ragService.js
//
// RAG en dos capas:
//
//  CAPA 1 — RAG ESTRUCTURADO (SQL)
//  --------------------------------
//  Consulta directa a PostgreSQL con los datos reales del usuario:
//  - Historial de completados día a día (90 días)
//  - Patrones por día de la semana
//  - Rachas y tendencias por hábito
//  - Notas escritas en cada hábito
//  No requiere embeddings. Resultado: contexto numérico preciso.
//
//  CAPA 2 — RAG VECTORIAL (pgvector)
//  -----------------------------------
//  Base de conocimiento científica sobre hábitos.
//  Busca los artículos más relevantes para la pregunta del usuario.
//  Resultado: respuestas con fuentes ("según estudio Oxford 2010…")
//
//  FLUJO COMPLETO:
//  pregunta usuario
//       ↓
//  [Capa 1] → contexto personal del usuario (SQL, siempre)
//  [Capa 2] → fragmentos científicos relevantes (vectorial, si aplica)
//       ↓
//  system prompt enriquecido → DeepSeek → respuesta contextualizada

import prisma from '../config/db.js';

// ═══════════════════════════════════════════════════════════════════
// CAPA 1 — CONTEXTO ESTRUCTURADO DEL USUARIO
// ═══════════════════════════════════════════════════════════════════

export const ragStructured = {

  /**
   * Construye el contexto completo del usuario consultando PostgreSQL.
   * Se llama antes de cada mensaje a DeepSeek.
   *
   * @param {string} userId
   * @returns {string} bloque de texto para inyectar en el system prompt
   */
  async buildUserContext(userId) {
    const [
      perfil,
      habitosActivos,
      patronesDiaSemana,
      historicoReciente,
      notasHabitos,
      rachas,
    ] = await Promise.all([
      _getPerfil(userId),
      _getHabitosActivos(userId),
      _getPatronesDiaSemana(userId),
      _getHistoricoReciente(userId, 30),
      _getNotasHabitos(userId),
      _getRachas(userId),
    ]);

    return _formatUserContext({
      perfil,
      habitosActivos,
      patronesDiaSemana,
      historicoReciente,
      notasHabitos,
      rachas,
    });
  },
};

// ── Consultas SQL ─────────────────────────────────────────────────

async function _getPerfil(userId) {
  return prisma.user.findUnique({
    where:  { id: userId },
    select: { nombre: true, plan: true, createdAt: true },
  });
}

async function _getHabitosActivos(userId) {
  const today = _today();
  const habits = await prisma.habit.findMany({
    where:   { userId, archivado: false },
    orderBy: { orden: 'asc' },
    select:  { id: true, nombre: true, frecuencia: true, categoria: true, nota: true },
  });

  const completedToday = await prisma.habitCompletion.findMany({
    where:   { userId, fecha: today },
    select:  { habitId: true },
  });
  const completedIds = new Set(completedToday.map(c => c.habitId));

  return habits.map(h => ({ ...h, completadoHoy: completedIds.has(h.id) }));
}

/**
 * Agrupa los completados por día de la semana.
 * Devuelve: [{ dia: "Lunes", completados: 45, posibles: 60, tasa: 75 }, ...]
 */
async function _getPatronesDiaSemana(userId) {
  const from = _daysAgo(90);

  const completions = await prisma.habitCompletion.findMany({
    where:   { userId, fecha: { gte: from } },
    select:  { fecha: true },
  });

  const totalHabits = await prisma.habit.count({
    where: { userId, archivado: false },
  });

  // Contar completados por día de semana (0=Dom, 1=Lun, …, 6=Sáb)
  const porDia = Array(7).fill(0).map(() => ({ completados: 0, dias: 0 }));
  const diasContados = new Set();

  for (const c of completions) {
    const d   = new Date(c.fecha);
    const dow = d.getDay();
    porDia[dow].completados++;
    const key = c.fecha.toISOString().slice(0, 10);
    if (!diasContados.has(key + dow)) {
      porDia[dow].dias++;
      diasContados.add(key + dow);
    }
  }

  const nombres = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  return porDia.map((d, i) => ({
    dia:          nombres[i],
    completados:  d.completados,
    posibles:     d.dias * totalHabits,
    tasa:         d.dias > 0 && totalHabits > 0
                    ? Math.round((d.completados / (d.dias * totalHabits)) * 100)
                    : 0,
  }));
}

/**
 * Historial reciente: para cada día devuelve cuántos hábitos se completaron.
 * Detecta: días perfectos, días sin nada, tendencia de la última semana.
 */
async function _getHistoricoReciente(userId, days = 30) {
  const from = _daysAgo(days);

  const [completions, totalHabits] = await Promise.all([
    prisma.habitCompletion.findMany({
      where:   { userId, fecha: { gte: from } },
      select:  { fecha: true, habitId: true },
      orderBy: { fecha: 'asc' },
    }),
    prisma.habit.count({ where: { userId, archivado: false } }),
  ]);

  // Agrupar por fecha
  const byDay = new Map();
  for (const c of completions) {
    const key = c.fecha.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) || 0) + 1);
  }

  // Construir array día a día
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d   = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const cnt = byDay.get(key) || 0;
    result.push({
      fecha:       key,
      diaSemana:   ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getDay()],
      completados: cnt,
      total:       totalHabits,
      perfecto:    totalHabits > 0 && cnt === totalHabits,
      fallido:     cnt === 0,
    });
  }

  // Calcular tendencia: comparar última semana vs semana anterior
  const ultima   = result.slice(-7).reduce((s, d) => s + d.completados, 0);
  const anterior = result.slice(-14, -7).reduce((s, d) => s + d.completados, 0);
  const tendencia = anterior > 0
    ? Math.round(((ultima - anterior) / anterior) * 100)
    : 0;

  return { dias: result, tendencia, totalHabits };
}

/**
 * Devuelve las notas de los hábitos del usuario.
 * Son contexto valioso: "meditación: 10 min antes de dormir"
 */
async function _getNotasHabitos(userId) {
  const habits = await prisma.habit.findMany({
    where:   { userId, archivado: false, nota: { not: null } },
    select:  { nombre: true, nota: true, categoria: true },
  });
  return habits.filter(h => h.nota?.trim());
}

/**
 * Racha actual de cada hábito.
 */
async function _getRachas(userId) {
  const habits = await prisma.habit.findMany({
    where:   { userId, archivado: false },
    select:  { id: true, nombre: true },
  });

  const rachas = await Promise.all(habits.map(async h => {
    const racha = await _calcularRacha(h.id);
    return { nombre: h.nombre, racha };
  }));

  return rachas.sort((a, b) => b.racha - a.racha);
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

// ── Formateador del contexto ──────────────────────────────────────

function _formatUserContext({ perfil, habitosActivos, patronesDiaSemana,
                               historicoReciente, notasHabitos, rachas }) {
  const hoy       = new Date().toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });
  const diasDesde = perfil?.createdAt
    ? Math.floor((Date.now() - new Date(perfil.createdAt)) / 86400000)
    : 0;

  // ── Sección 1: estado de hoy
  const completadosHoy = habitosActivos.filter(h => h.completadoHoy).length;
  const totalHabitos   = habitosActivos.length;

  // ── Sección 2: patrón semanal — mejor y peor día
  const sorted     = [...patronesDiaSemana].sort((a, b) => b.tasa - a.tasa);
  const mejorDia   = sorted[0];
  const peorDia    = sorted[sorted.length - 1];

  // ── Sección 3: tendencia reciente
  const { tendencia } = historicoReciente;
  const tendenciaStr  = tendencia > 5  ? `mejorando (+${tendencia}% vs semana anterior)`
                      : tendencia < -5 ? `bajando (${tendencia}% vs semana anterior)`
                      : 'estable';

  // ── Sección 4: días problemáticos recientes (fallidos en últimos 7 días)
  const diasFallidos = historicoReciente.dias
    .slice(-7)
    .filter(d => d.fallido)
    .map(d => `${d.diaSemana} ${d.fecha.slice(5)}`);

  // ── Sección 5: días con fallos parciales por hábito
  // (para responder "el martes pasado fallaste meditación")
  const fallosParciales = historicoReciente.dias
    .slice(-14)
    .filter(d => d.completados > 0 && d.completados < d.total)
    .slice(-5)
    .map(d => `${d.diaSemana} ${d.fecha.slice(5)}: ${d.completados}/${d.total} hábitos`);

  // ── Sección 6: notas de hábitos
  const notasStr = notasHabitos.length > 0
    ? notasHabitos.map(n => `  ${n.nombre}: "${n.nota}"`).join('\n')
    : '  (sin notas)';

  // ── Sección 7: rachas actuales
  const rachasStr = rachas.length > 0
    ? rachas.map(r => `  ${r.nombre}: ${r.racha} días`).join('\n')
    : '  (sin rachas activas)';

  // ── Patrón por día de semana (tabla compacta)
  const patronStr = patronesDiaSemana
    .filter(d => d.posibles > 0)
    .map(d => `  ${d.dia}: ${d.tasa}% (${d.completados}/${d.posibles})`)
    .join('\n');

  return `
CONTEXTO PERSONAL DEL USUARIO (datos reales de su historial):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HOY (${hoy}):
  Completados hoy: ${completadosHoy} de ${totalHabitos} hábitos
  Lleva ${diasDesde} días usando KIP
  Tendencia reciente: ${tendenciaStr}

HÁBITOS ACTIVOS:
${habitosActivos.map(h =>
  `  ${h.completadoHoy ? '✓' : '○'} ${h.nombre} (${h.categoria.toLowerCase()}, ${h.frecuencia.toLowerCase()})`
).join('\n')}

RACHAS ACTUALES:
${rachasStr}

NOTAS DE HÁBITOS (contexto de intención del usuario):
${notasStr}

PATRÓN POR DÍA DE SEMANA (últimos 90 días):
${patronStr}
  Mejor día: ${mejorDia?.dia} (${mejorDia?.tasa}%)
  Día más flojo: ${peorDia?.dia} (${peorDia?.tasa}%)

ÚLTIMOS 14 DÍAS CON CUMPLIMIENTO PARCIAL:
${fallosParciales.length > 0 ? fallosParciales.map(f => `  ${f}`).join('\n') : '  (sin fallos parciales recientes)'}

DÍAS SIN COMPLETAR NINGÚN HÁBITO (últimos 7 días):
${diasFallidos.length > 0 ? diasFallidos.map(d => `  ${d}`).join('\n') : '  (ninguno — ¡bien hecho!)'}
`.trim();
}

// ═══════════════════════════════════════════════════════════════════
// CAPA 2 — RAG VECTORIAL (base de conocimiento científica)
// ═══════════════════════════════════════════════════════════════════

export const ragVectorial = {

  /**
   * Busca los chunks de conocimiento más relevantes para una pregunta.
   * Usa pgvector para búsqueda por similitud coseno.
   *
   * @param {string} pregunta — el último mensaje del usuario
   * @param {number} topK     — cuántos chunks devolver (default 3)
   * @returns {string} contexto científico formateado, o "" si no hay resultados
   */
  async search(pregunta, topK = 3) {
    // Verificar si pgvector está disponible y hay chunks sembrados
    const count = await _chunkCount();
    if (count === 0) return '';

    // Generar embedding de la pregunta
    const embedding = await _embed(pregunta);
    if (!embedding) return '';

    // Búsqueda por similitud coseno usando pgvector
    const chunks = await _similaritySearch(embedding, topK);
    if (!chunks.length) return '';

    return _formatKnowledge(chunks);
  },

  /**
   * Verifica si el sistema vectorial está disponible y operativo.
   */
  async isAvailable() {
    try {
      const count = await _chunkCount();
      return count > 0;
    } catch {
      return false;
    }
  },
};

// ── Helpers vectoriales ───────────────────────────────────────────

async function _chunkCount() {
  try {
    const result = await prisma.$queryRaw`SELECT COUNT(*) as count FROM knowledge_chunks WHERE embedding IS NOT NULL`;
    return parseInt(result[0]?.count || '0');
  } catch {
    return 0;
  }
}

/**
 * Genera el embedding de un texto usando DeepSeek Embeddings API.
 * Modelo: text-embedding-v2 (compatible con OpenAI API format).
 * Si falla, retorna null y el RAG vectorial se desactiva gracefully.
 */
async function _embed(text) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.deepseek.com/embeddings', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-v2',
        input: text.slice(0, 8000), // límite de tokens
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.[0]?.embedding || null;
  } catch {
    return null;
  }
}

/**
 * Ejecuta la búsqueda por similitud coseno con pgvector.
 * Requiere que pgvector esté instalado y que los chunks tengan embedding.
 */
async function _similaritySearch(embedding, topK) {
  try {
    // pgvector usa el operador <=> para distancia coseno
    const vectorStr = `[${embedding.join(',')}]`;
    const results   = await prisma.$queryRaw`
      SELECT
        id,
        titulo,
        contenido,
        fuente,
        categoria,
        1 - (embedding <=> ${vectorStr}::vector) AS similitud
      FROM knowledge_chunks
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${topK}
    `;
    // Filtrar por umbral mínimo de similitud (0.7 = bastante relevante)
    return results.filter(r => parseFloat(r.similitud) >= 0.7);
  } catch (err) {
    // pgvector no disponible o error de sintaxis — degradar gracefully
    console.warn('[RAG] pgvector no disponible, saltando búsqueda vectorial:', err.message);
    return [];
  }
}

function _formatKnowledge(chunks) {
  if (!chunks.length) return '';

  const items = chunks.map(c =>
    `[${c.fuente}]\n${c.contenido.slice(0, 400)}`
  ).join('\n\n---\n\n');

  return `
CONOCIMIENTO CIENTÍFICO RELEVANTE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${items}
`.trim();
}

// ── Utils ─────────────────────────────────────────────────────────

function _today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function _daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}
