-- ═══════════════════════════════════════════════════════════════════
-- KIP · Base de datos PostgreSQL completa
-- ═══════════════════════════════════════════════════════════════════
--
-- Cómo ejecutar:
--   En Supabase:  SQL Editor → pegar todo este archivo → Run
--   En local:     psql -U postgres -d kip_db -f kip_database.sql
--   En Railway:   plugin PostgreSQL → Query → pegar y ejecutar
--
-- Incluye:
--   1. Extensiones (pgvector para RAG)
--   2. Tipos ENUM
--   3. Tablas con índices y restricciones
--   4. Datos iniciales (12 badges + 14 artículos científicos)
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────
-- 1. EXTENSIONES
-- ───────────────────────────────────────────────────────────────────

-- pgvector: búsqueda semántica para el RAG
-- En Supabase ya viene disponible, solo hay que activarla
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- generación de UUIDs
CREATE EXTENSION IF NOT EXISTS "vector";      -- embeddings para RAG


-- ───────────────────────────────────────────────────────────────────
-- 2. TIPOS ENUM
-- ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "Frecuencia" AS ENUM ('DIARIO', 'SEMANAL', 'MENSUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "Categoria" AS ENUM (
    'BIENESTAR', 'SALUD', 'MENTE', 'SOCIAL', 'TRABAJO', 'GENERAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ───────────────────────────────────────────────────────────────────
-- 3. TABLAS
-- ───────────────────────────────────────────────────────────────────

-- ── Usuarios ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(254)  NOT NULL UNIQUE,
  password_hash TEXT          NOT NULL,
  nombre        VARCHAR(80)   NOT NULL,
  plan          "Plan"        NOT NULL DEFAULT 'FREE',
  tema          VARCHAR(30)   NOT NULL DEFAULT 'ember',
  timezone      VARCHAR(50)   NOT NULL DEFAULT 'America/Mexico_City',
  idioma        VARCHAR(5)    NOT NULL DEFAULT 'es',
  sound_enabled BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- ── Sesiones (refresh tokens) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  refresh_token VARCHAR(512)  NOT NULL UNIQUE,
  user_agent    TEXT,
  ip_address    VARCHAR(45),
  expires_at    TIMESTAMPTZ   NOT NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id  ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires   ON sessions (expires_at);

-- ── Hábitos ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS habits (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  nombre        VARCHAR(48)   NOT NULL,
  frecuencia    "Frecuencia"  NOT NULL DEFAULT 'DIARIO',
  categoria     "Categoria"   NOT NULL DEFAULT 'GENERAL',
  nota          VARCHAR(80),
  meta_semanal  INTEGER       CHECK (meta_semanal BETWEEN 1 AND 7),
  meta_mensual  INTEGER       CHECK (meta_mensual BETWEEN 1 AND 31),
  orden         INTEGER       NOT NULL DEFAULT 0,
  archivado     BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_habits_user_id   ON habits (user_id);
CREATE INDEX IF NOT EXISTS idx_habits_archivado ON habits (user_id, archivado);

-- ── Registro de completados por día ──────────────────────────────
-- Una fila por (habit_id, fecha) — historial real para el heatmap y RAG
CREATE TABLE IF NOT EXISTS habit_completions (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  habit_id    UUID        NOT NULL REFERENCES habits (id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users  (id) ON DELETE CASCADE,
  fecha       DATE        NOT NULL,
  completado  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_habit_fecha UNIQUE (habit_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_completions_user_fecha
  ON habit_completions (user_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_completions_habit_fecha
  ON habit_completions (habit_id, fecha DESC);

-- ── Catálogo de badges (global, compartido) ───────────────────────
CREATE TABLE IF NOT EXISTS badge_definitions (
  id          VARCHAR(10)  PRIMARY KEY,
  nombre      VARCHAR(50)  NOT NULL,
  descripcion VARCHAR(200) NOT NULL,
  icono       VARCHAR(20)  NOT NULL,
  meta_valor  INTEGER,
  meta_tipo   VARCHAR(50)
);

-- ── Badges ganados por usuario ────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_badges (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES users           (id) ON DELETE CASCADE,
  badge_id    VARCHAR(10) NOT NULL REFERENCES badge_definitions (id),
  fecha_logro TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_user_badge UNIQUE (user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges (user_id);

-- ── Base de conocimiento vectorial (RAG) ─────────────────────────
-- Artículos científicos sobre hábitos chunkeados y vectorizados
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id        UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  titulo    VARCHAR(200)  NOT NULL,
  contenido TEXT          NOT NULL,
  fuente    VARCHAR(300)  NOT NULL,
  categoria VARCHAR(50)   NOT NULL,
  embedding vector(1536),             -- vector de embedding (pgvector)
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Índice HNSW para búsqueda por similitud coseno (más rápido que IVFFlat)
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);


-- ───────────────────────────────────────────────────────────────────
-- 4. TRIGGER: actualizar updated_at automáticamente
-- ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at  ON users;
DROP TRIGGER IF EXISTS trg_habits_updated_at ON habits;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_habits_updated_at
  BEFORE UPDATE ON habits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ───────────────────────────────────────────────────────────────────
-- 5. DATOS INICIALES — BADGES
-- ───────────────────────────────────────────────────────────────────

INSERT INTO badge_definitions (id, nombre, descripcion, icono, meta_valor, meta_tipo) VALUES
  ('b1',  'Primera semana',    'Completaste 7 días seguidos. ¡El comienzo de algo grande!', 'gold',   7,   'racha'),
  ('b2',  'Constancia solar',  'Racha de 14 días. El sol sale para quien madruga.',         'amber',  14,  'racha'),
  ('b3',  'Hábito forjado',    '21 días sin parar. La ciencia dice que ya es un hábito.',  'teal',   21,  'racha'),
  ('b4',  'Mes completo',      'Racha de 30 días. Un mes entero de disciplina.',            'violet', 30,  'racha'),
  ('b5',  'Racha de fuego',    'Racha de 50 días. La llama no se apaga.',                  'rose',   50,  'racha'),
  ('b6',  'Maestro del hábito','100 días seguidos. Eres un ejemplo a seguir.',             'green',  100, 'racha'),
  ('b7',  'Madrugador',        'Completa un hábito antes de las 8am 5 veces.',             'amber',  5,   'madrugador'),
  ('b8',  'Multitarea',        'Ten 5 o más hábitos activos al mismo tiempo.',             'teal',   5,   'habitos_activos'),
  ('b9',  'Sin excusas',       'No pierdas ni un día en una semana completa.',             'violet', 7,   'semana_perfecta'),
  ('b10', 'Velocista',         'Completa todos tus hábitos antes del mediodía.',           'gold',   3,   'antes_mediodia'),
  ('b11', 'Explorador',        'Crea hábitos en 4 categorías distintas.',                  'rose',   4,   'categorias'),
  ('b12', 'Leyenda',           'Racha de 365 días. Un año entero sin rendirse.',           'gold',   365, 'racha')
ON CONFLICT (id) DO UPDATE SET
  nombre      = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  icono       = EXCLUDED.icono,
  meta_valor  = EXCLUDED.meta_valor,
  meta_tipo   = EXCLUDED.meta_tipo;


-- ───────────────────────────────────────────────────────────────────
-- 6. DATOS INICIALES — BASE DE CONOCIMIENTO CIENTÍFICA (RAG)
-- ───────────────────────────────────────────────────────────────────
-- Los embeddings se generan después con: npm run rag:embed
-- Por ahora se insertan sin vector (NULL) — la búsqueda vectorial
-- se activa automáticamente cuando los embeddings están presentes.

INSERT INTO knowledge_chunks (titulo, contenido, fuente, categoria) VALUES

  (
    'Cuánto tiempo tarda en formarse un hábito',
    'Un estudio de la University College London (Lally et al., 2010) con 96 participantes encontró que los hábitos tardan entre 18 y 254 días en automatizarse, con una media de 66 días. El tiempo varía según la complejidad: beber un vaso de agua al levantarse se automatiza en ~20 días; hacer 50 abdominales antes del desayuno puede tardar más de 80 días. La clave no es la duración sino la consistencia: saltarse un día ocasional no rompe el proceso de formación.',
    'Lally et al., University College London (2010)',
    'formacion'
  ),
  (
    'El loop del hábito: señal, rutina, recompensa',
    'Charles Duhigg describe en "The Power of Habit" (2012) que todo hábito opera en un loop de tres elementos: la señal (un disparador que activa el comportamiento automático), la rutina (el comportamiento en sí) y la recompensa (el beneficio que refuerza el loop). Para cambiar un mal hábito, la estrategia más efectiva no es eliminarlo sino sustituir la rutina manteniendo la señal y la recompensa originales.',
    'Duhigg, The Power of Habit (2012)',
    'formacion'
  ),
  (
    'Regla de los dos minutos para empezar hábitos',
    'James Clear propone en "Atomic Habits" (2018) la regla de los dos minutos: cualquier nuevo hábito debe poder completarse en menos de dos minutos en su versión inicial. "Leer antes de dormir" se convierte en "leer una página". "Hacer ejercicio 30 minutos" se convierte en "ponerse la ropa deportiva". El objetivo es crear la automaticidad primero; la duración se amplía después.',
    'Clear, Atomic Habits (2018)',
    'formacion'
  ),
  (
    'Stacking de hábitos: anclar lo nuevo a lo existente',
    'El "habit stacking" consiste en anclar un nuevo hábito a uno que ya existe. Fórmula: "Después de [hábito actual], haré [nuevo hábito]". BJ Fogg lo llama "recetas de hábito" en Tiny Habits (2020). Este método aprovecha la señal ya establecida del hábito existente, reduciendo la fricción cognitiva a casi cero.',
    'Fogg, Tiny Habits (2020) / Clear, Atomic Habits (2018)',
    'formacion'
  ),
  (
    'Por qué las rachas funcionan psicológicamente',
    'El efecto de compromiso de consistencia (Cialdini, 1984) explica por qué las rachas son motivadoras: una vez que una persona ve su "cadena" de días consecutivos, se activa un sesgo cognitivo que impulsa a no romperla. La investigación de Gardner et al. (2012) advierte que la racha no debe convertirse en el objetivo principal; el objetivo es la automaticidad del comportamiento, no el número en sí.',
    'Gardner et al. (2012) / Cialdini (1984)',
    'consistencia'
  ),
  (
    'Efecto nunca falles dos veces seguidas',
    'James Clear documenta que los atletas y personas de alto rendimiento raramente son perfectos — lo que los distingue es que rara vez fallan dos veces seguidas. Un día fallido es un accidente; dos días fallidos es el inicio de un nuevo hábito (el de no hacerlo). La regla práctica: si fallas un día, el día siguiente es el más importante de tu racha.',
    'Clear, Atomic Habits (2018)',
    'consistencia'
  ),
  (
    'Variabilidad de la consistencia según el día de la semana',
    'Estudios de seguimiento de comportamiento (Luszczynska et al., 2013) muestran que la consistencia en hábitos de salud varía sistemáticamente según el día de la semana. Los lunes tienen la mayor tasa de inicio de nuevos comportamientos ("efecto Monday reset"). Los viernes y fines de semana muestran las tasas de abandono más altas, especialmente en hábitos relacionados con alimentación y ejercicio.',
    'Luszczynska et al. (2013)',
    'consistencia'
  ),
  (
    'Motivación intrínseca vs extrínseca en hábitos',
    'La Teoría de la Autodeterminación (Deci & Ryan, 1985) distingue entre motivación intrínseca y extrínseca. Los hábitos basados en motivación intrínseca se mantienen significativamente más tiempo. En hábitos de salud, las personas que reportan "me gusta cómo me siento" tienen 3.5 veces más probabilidades de mantener el hábito a los 12 meses que quienes reportan motivaciones externas.',
    'Deci & Ryan, Self-Determination Theory (1985)',
    'motivacion'
  ),
  (
    'El papel de la identidad en los hábitos duraderos',
    'James Clear argumenta que los hábitos más duraderos son los anclados a la identidad, no a los resultados. "Quiero perder 10 kg" es un objetivo de resultado. "Soy una persona que cuida su cuerpo" es una afirmación de identidad. Cada vez que completas un hábito, emites un "voto" a favor de esa identidad. Dos personas pueden proponerse dejar de fumar: una dice "estoy intentando dejarlo", la otra dice "no fumo". La segunda tiene el doble de probabilidades de éxito.',
    'Clear, Atomic Habits (2018)',
    'motivacion'
  ),
  (
    'Beneficios de la meditación con 8 semanas de práctica',
    'Un estudio de Harvard (Hölzel et al., 2011) con resonancia magnética mostró que 8 semanas de meditación mindfulness (promedio 27 min/día) producen cambios medibles en la densidad de materia gris en el hipocampo (aprendizaje y memoria) y en la amígdala (estrés y ansiedad). Los participantes reportaron reducciones del 43% en estrés percibido.',
    'Hölzel et al., Harvard Medical School (2011)',
    'bienestar'
  ),
  (
    'Ejercicio y salud mental: cuánto es suficiente',
    'Un meta-análisis de 49 estudios (Schuch et al., 2016) encontró que el ejercicio tiene un efecto comparable a los antidepresivos en casos de depresión leve a moderada. La dosis óptima es 150 minutos semanales de ejercicio moderado o 75 minutos de ejercicio intenso. Incluso 10-15 minutos diarios producen mejoras significativas en el estado de ánimo medibles en la misma sesión.',
    'Schuch et al. (2016) / WHO Guidelines (2020)',
    'salud'
  ),
  (
    'Hidratación y rendimiento cognitivo',
    'Una deshidratación de tan solo el 1-2% del peso corporal reduce el rendimiento cognitivo en un 10-15%, según estudios de la Universidad de Connecticut. Los síntomas incluyen dificultad de concentración, fatiga y deterioro de la memoria a corto plazo, incluso antes de sentir sed. La recomendación estándar de 2 litros diarios es un buen objetivo base.',
    'Muñoz et al., University of Connecticut (2011)',
    'salud'
  ),
  (
    'Lectura diaria y reducción del estrés',
    'Un estudio de la Universidad de Sussex (Lewis, 2009) encontró que leer durante 6 minutos reduce los niveles de estrés en un 68%, más efectivo que escuchar música (61%), tomar té (54%) o caminar (42%). Los investigadores atribuyen el efecto a la inmersión narrativa, que obliga al cerebro a salir del estado de rumiación.',
    'Lewis, University of Sussex (2009)',
    'bienestar'
  ),
  (
    'Diseño de entorno: hacer los hábitos obvios y fáciles',
    'BJ Fogg y James Clear coinciden en que el entorno físico es el diseñador invisible del comportamiento. Para promover un hábito, reducir la fricción: dejar el libro en la almohada, poner las zapatillas junto a la cama, preparar la botella de agua la noche anterior. Para romper un mal hábito, aumentar la fricción. Cada punto de fricción reducido aumenta la probabilidad de ejecución en un promedio del 15-20%.',
    'Fogg, Tiny Habits (2020) / Clear, Atomic Habits (2018)',
    'diseno'
  )

ON CONFLICT DO NOTHING;


-- ───────────────────────────────────────────────────────────────────
-- 7. VERIFICACIÓN FINAL
-- ───────────────────────────────────────────────────────────────────

DO $$
DECLARE
  cnt_tables    INTEGER;
  cnt_badges    INTEGER;
  cnt_knowledge INTEGER;
BEGIN
  SELECT COUNT(*) INTO cnt_tables
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'users','sessions','habits','habit_completions',
        'badge_definitions','user_badges','knowledge_chunks'
      );

  SELECT COUNT(*) INTO cnt_badges    FROM badge_definitions;
  SELECT COUNT(*) INTO cnt_knowledge FROM knowledge_chunks;

  RAISE NOTICE '══════════════════════════════════════';
  RAISE NOTICE 'KIP Database — Verificación:';
  RAISE NOTICE '  Tablas creadas:      % / 7', cnt_tables;
  RAISE NOTICE '  Badges sembrados:    %',      cnt_badges;
  RAISE NOTICE '  Artículos RAG:       %',      cnt_knowledge;
  RAISE NOTICE '';
  RAISE NOTICE '  Siguiente paso: ejecutar';
  RAISE NOTICE '  npm run rag:embed';
  RAISE NOTICE '  para generar los vectores del RAG.';
  RAISE NOTICE '══════════════════════════════════════';
END $$;
