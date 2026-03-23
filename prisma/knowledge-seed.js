// KIP · prisma/knowledge-seed.js
// Siembra la base de conocimiento científica sobre hábitos.
// Los embeddings se generan automáticamente al ejecutar: npm run rag:embed
//
// Fuentes usadas:
//   - Lally et al. (2010) UCL — "How habits are formed" (el estudio Oxford)
//   - Clear, James (2018) — Atomic Habits
//   - Duhigg, Charles (2012) — The Power of Habit
//   - Fogg, BJ (2020) — Tiny Habits
//   - Gardner et al. (2012) — revisión sistemática sobre automaticidad

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CHUNKS = [
  // ── Formación de hábitos ────────────────────────────────────────
  {
    titulo:    'Cuánto tiempo tarda en formarse un hábito',
    contenido: 'Un estudio de la University College London (Lally et al., 2010) con 96 participantes encontró que los hábitos tardan entre 18 y 254 días en automatizarse, con una media de 66 días. El tiempo varía según la complejidad: beber un vaso de agua al levantarse se automatiza en ~20 días; hacer 50 abdominales antes del desayuno puede tardar más de 80 días. La clave no es la duración sino la consistencia: saltarse un día ocasional no rompe el proceso de formación.',
    fuente:    'Lally et al., University College London (2010)',
    categoria: 'formacion',
  },
  {
    titulo:    'El loop del hábito: señal, rutina, recompensa',
    contenido: 'Charles Duhigg describe en "The Power of Habit" (2012) que todo hábito opera en un loop de tres elementos: la señal (un disparador que activa el comportamiento automático), la rutina (el comportamiento en sí) y la recompensa (el beneficio que refuerza el loop). Para cambiar un mal hábito, la estrategia más efectiva no es eliminarlo sino sustituir la rutina manteniendo la señal y la recompensa originales.',
    fuente:    'Duhigg, The Power of Habit (2012)',
    categoria: 'formacion',
  },
  {
    titulo:    'Regla de los dos minutos para empezar hábitos',
    contenido: 'James Clear propone en "Atomic Habits" (2018) la regla de los dos minutos: cualquier nuevo hábito debe poder completarse en menos de dos minutos en su versión inicial. "Leer antes de dormir" se convierte en "leer una página". "Hacer ejercicio 30 minutos" se convierte en "ponerse la ropa deportiva". El objetivo es crear la automaticidad primero; la duración se amplía después.',
    fuente:    'Clear, Atomic Habits (2018)',
    categoria: 'formacion',
  },
  {
    titulo:    'Stacking de hábitos: anclar lo nuevo a lo existente',
    contenido: 'El "habit stacking" consiste en anclar un nuevo hábito a uno que ya existe. Fórmula: "Después de [hábito actual], haré [nuevo hábito]". Ejemplos: "Después de servir mi café matutino, escribiré en mi diario 5 minutos". BJ Fogg lo llama "recetas de hábito" en Tiny Habits (2020). Este método aprovecha la señal ya establecida del hábito existente, reduciendo la fricción cognitiva a casi cero.',
    fuente:    'Fogg, Tiny Habits (2020) / Clear, Atomic Habits (2018)',
    categoria: 'formacion',
  },

  // ── Consistencia y rachas ───────────────────────────────────────
  {
    titulo:    'Por qué las rachas funcionan psicológicamente',
    contenido: 'El efecto de compromiso de consistencia (Cialdini, 1984) explica por qué las rachas son motivadoras: una vez que una persona ve su "cadena" de días consecutivos, se activa un sesgo cognitivo que impulsa a no romperla. Sin embargo, la investigación de Gardner et al. (2012) advierte que la racha no debe convertirse en el objetivo principal; el objetivo es la automaticidad del comportamiento, no el número en sí.',
    fuente:    'Gardner et al. (2012) / Cialdini (1984)',
    categoria: 'consistencia',
  },
  {
    titulo:    'Efecto "nunca failles dos veces seguidas"',
    contenido: 'James Clear documenta que los atletas y personas de alto rendimiento raramente son perfectos — lo que los distingue es que rara vez fallan dos veces seguidas. Un día fallido es un accidente; dos días fallidos es el inicio de un nuevo hábito (el de no hacerlo). La regla práctica: si fallas un día, el día siguiente es el más importante de tu racha.',
    fuente:    'Clear, Atomic Habits (2018)',
    categoria: 'consistencia',
  },
  {
    titulo:    'Variabilidad de la consistencia según el día de la semana',
    contenido: 'Estudios de seguimiento de comportamiento (Luszczynska et al., 2013) muestran que la consistencia en hábitos de salud varía sistemáticamente según el día de la semana. Los lunes tienen la mayor tasa de inicio de nuevos comportamientos ("efecto Monday reset"). Los viernes y fines de semana muestran las tasas de abandono más altas, especialmente en hábitos relacionados con alimentación y ejercicio.',
    fuente:    'Luszczynska et al. (2013)',
    categoria: 'consistencia',
  },

  // ── Motivación ──────────────────────────────────────────────────
  {
    titulo:    'Motivación intrínseca vs extrínseca en hábitos',
    contenido: 'La Teoría de la Autodeterminación (Deci & Ryan, 1985) distingue entre motivación intrínseca (el comportamiento es inherentemente satisfactorio) y extrínseca (recompensas o castigos externos). Los hábitos basados en motivación intrínseca se mantienen significativamente más tiempo. En hábitos de salud, las personas que reportan "me gusta cómo me siento" tienen 3.5 veces más probabilidades de mantener el hábito a los 12 meses que quienes reportan motivaciones externas.',
    fuente:    'Deci & Ryan, Self-Determination Theory (1985)',
    categoria: 'motivacion',
  },
  {
    titulo:    'El papel de la identidad en los hábitos duraderos',
    contenido: 'James Clear argumenta que los hábitos más duraderos son los que están anclados a la identidad, no a los resultados. "Quiero perder 10 kg" es un objetivo de resultado. "Soy una persona que cuida su cuerpo" es una afirmación de identidad. Cada vez que completas un hábito, emites un "voto" a favor de esa identidad. Dos personas pueden proponerse dejar de fumar: una dice "estoy intentando dejarlo", la otra dice "no fumo". La segunda tiene el doble de probabilidades de éxito.',
    fuente:    'Clear, Atomic Habits (2018)',
    categoria: 'motivacion',
  },

  // ── Bienestar y hábitos específicos ────────────────────────────
  {
    titulo:    'Beneficios de la meditación con 8 semanas de práctica',
    contenido: 'Un estudio de Harvard (Hölzel et al., 2011) con resonancia magnética mostró que 8 semanas de meditación mindfulness (promedio 27 min/día) producen cambios medibles en la densidad de materia gris en el hipocampo (asociado a aprendizaje y memoria) y en la amígdala (asociado a estrés y ansiedad). Los participantes reportaron reducciones del 43% en estrés percibido.',
    fuente:    'Hölzel et al., Harvard Medical School (2011)',
    categoria: 'bienestar',
  },
  {
    titulo:    'Ejercicio y salud mental: cuánto es suficiente',
    contenido: 'Un meta-análisis de 49 estudios (Schuch et al., 2016) encontró que el ejercicio tiene un efecto comparable a los antidepresivos en casos de depresión leve a moderada. La dosis óptima es 150 minutos semanales de ejercicio moderado (como caminar rápido) o 75 minutos de ejercicio intenso. Incluso 10-15 minutos diarios producen mejoras significativas en el estado de ánimo medibles en la misma sesión.',
    fuente:    'Schuch et al. (2016) / WHO Guidelines (2020)',
    categoria: 'salud',
  },
  {
    titulo:    'Hidratación y rendimiento cognitivo',
    contenido: 'Una deshidratación de tan solo el 1-2% del peso corporal (equivalente a perder ~0.7-1.4 litros en una persona de 70 kg) reduce el rendimiento cognitivo en un 10-15%, según estudios de la Universidad de Connecticut. Los síntomas incluyen dificultad de concentración, fatiga y deterioro de la memoria a corto plazo, incluso antes de sentir sed. La recomendación estándar de 2 litros diarios es un buen objetivo base.',
    fuente:    'Muñoz et al., University of Connecticut (2011)',
    categoria: 'salud',
  },
  {
    titulo:    'Lectura diaria y reducción del estrés',
    contenido: 'Un estudio de la Universidad de Sussex (Lewis, 2009) encontró que leer durante 6 minutos reduce los niveles de estrés en un 68%, más efectivo que escuchar música (61%), tomar té (54%) o caminar (42%). Los investigadores atribuyen el efecto a la inmersión narrativa, que obliga al cerebro a salir del estado de rumiación. La lectura de no-ficción también está asociada con mejora en empatía y teoría de la mente.',
    fuente:    'Lewis, University of Sussex (2009)',
    categoria: 'bienestar',
  },

  // ── Diseño de entorno y fricción ────────────────────────────────
  {
    titulo:    'Diseño de entorno: hacer los hábitos obvios y fáciles',
    contenido: 'BJ Fogg y James Clear coinciden en que el entorno físico es el diseñador invisible del comportamiento. Para promover un hábito, reducir la fricción: dejar el libro en la almohada, poner las zapatillas junto a la cama, preparar la botella de agua la noche anterior. Para romper un mal hábito, aumentar la fricción: guardar el teléfono en otro cuarto, no tener snacks procesados en casa. Cada punto de fricción reducido aumenta la probabilidad de ejecución en un promedio del 15-20%.',
    fuente:    'Fogg, Tiny Habits (2020) / Clear, Atomic Habits (2018)',
    categoria: 'diseno',
  },
];

async function seedKnowledge() {
  let created = 0;
  for (const chunk of CHUNKS) {
    await prisma.knowledgeChunk.upsert({
      where:  { id: chunk.titulo }, // usar titulo como identificador único provisional
      update: chunk,
      create: chunk,
    }).catch(async () => {
      // Si el where falla (no hay unique en titulo), simplemente insertar
      await prisma.knowledgeChunk.create({ data: chunk });
    });
    created++;
  }
  console.log(`✅ ${created} chunks de conocimiento sembrados`);
  console.log(`   Para generar embeddings ejecuta: npm run rag:embed`);
}

seedKnowledge()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
