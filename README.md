# KIP — Despliegue en Railway

Monolito: Express sirve el frontend + la API en el mismo servidor.

```
Kipcloud.com
   │
Railway (Node.js 20)
   ├── /app/*      → frontend HTML/CSS/JS (public/)
   ├── /assets/*   → CSS, imágenes
   └── /api/v1/*   → API REST
         │
    PostgreSQL (plugin Railway)
```

---

## Despliegue en Railway (paso a paso)

### Paso 1 — Subir a GitHub

```bash
cd kip-monolito/
git init
git add .
git commit -m "KIP inicial"
# Crear repo en github.com y luego:
git remote add origin https://github.com/TU_USUARIO/kip.git
git push -u origin main
```

### Paso 2 — Crear proyecto en Railway

1. Ir a [railway.app](https://railway.app) → crear cuenta gratuita
2. **New Project → Deploy from GitHub repo**
3. Seleccionar el repo `kip`

### Paso 3 — Añadir PostgreSQL

1. Dentro del proyecto → **+ Add Plugin → PostgreSQL**
2. Railway añade `DATABASE_URL` automáticamente

### Paso 4 — Añadir variables de entorno

Railway → tu servicio → **Variables**:

```
NODE_ENV              production
JWT_SECRET            (ver abajo cómo generar)
JWT_EXPIRES_IN        15m
JWT_REFRESH_EXPIRES_IN 7d
COOKIE_SECURE         true
DEEPSEEK_API_KEY      sk-tu-key-aqui
DEEPSEEK_MODEL        deepseek-chat
AI_REQUIRES_PREMIUM   false
```

**Generar JWT_SECRET** (en tu terminal):
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Paso 5 — Build y start automáticos

Railway detecta estos scripts de `package.json`:
- **build:** `prisma generate && prisma migrate deploy && node prisma/seed.js`
- **start:** `node src/index.js`

Las tablas y badges se crean solos en cada deploy.

### Paso 6 — Conectar tu dominio

1. Railway → **Settings → Domains → Add Custom Domain**
2. Escribe `tu-dominio.com`
3. Railway te da los registros DNS — añádelos donde compraste el dominio:

| Tipo  | Nombre | Valor                          |
|-------|--------|--------------------------------|
| CNAME | `www`  | `tu-app.up.railway.app`        |
| CNAME | `@`    | `tu-app.up.railway.app`        |

4. Esperar 5-15 min → Railway activa HTTPS automático ✅

### Verificar

```
https://tu-dominio.com/health        → {"status":"ok"}
https://tu-dominio.com/app/login/    → pantalla de login
```

---

## Desarrollo local

```bash
npm install
createdb kip_db            # crear BD local
cp .env.example .env       # configurar variables
# editar .env: DATABASE_URL, JWT_SECRET, DEEPSEEK_API_KEY

npm run db:push            # crear tablas
npm run db:seed            # sembrar badges
npm run dev                # → http://localhost:3000
```

En local el frontend usa **modo mock** (datos de prueba, sin BD).
Para probar la API real en local: edita `public/src/config.js`
y cambia `USE_REAL_API` a `true`.

---

## Coste Railway

| Plan  | Precio | Notas                    |
|-------|--------|--------------------------|
| Hobby | $5/mes | Suficiente para empezar  |
| Pro   | $20/mes| Sin cold starts, más RAM |

---

## RAG — IA con contexto real

KIP usa RAG en dos capas para que la IA responda con datos reales:

**Capa 1 — Historial del usuario (automático)**
Cada mensaje consulta PostgreSQL antes de llamar a DeepSeek:
- Patrones por día de semana ("los lunes completas el 90%")
- Días con fallos ("el martes pasado fallaste 3 hábitos")
- Rachas actuales y notas de cada hábito
- Tendencia de la última semana

**Capa 2 — Base de conocimiento científica (requiere setup)**
Artículos de investigación sobre hábitos chunkeados y vectorizados con pgvector.

### Setup RAG vectorial (una sola vez)

```bash
# 1. Activar pgvector en Railway:
#    Plugin PostgreSQL → Extensions → instalar "vector"
#
# En local:
psql kip_db -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 2. Sembrar los artículos científicos
npm run rag:seed

# 3. Generar embeddings (requiere DEEPSEEK_API_KEY en .env)
npm run rag:embed
```

### Ejemplos de respuestas con RAG

```
Usuario: "¿Cuándo fallo más?"
IA: "Según tu historial, los domingos es tu día más flojo con
     solo un 42% de completado. Los miércoles son los mejores
     con 91%. Esta semana llevas -8% respecto a la anterior."

Usuario: "¿Cuánto tarda en formarse un hábito?"
IA: "La investigación de Lally et al. (UCL, 2010) encontró que
     los hábitos tardan entre 18 y 254 días, con una media de
     66 días. Para tu hábito de Meditación que llevas 14 días,
     vas por buen camino — solo saltar 1-2 días no rompe el proceso."

Usuario: "¿Cómo está mi hábito de ejercicio?"
IA: "Ejercicio lleva una racha de 7 días y lo completas el 71%
     de las semanas. Tu nota dice '30 min de cardio o fuerza' —
     según la OMS, con 150 min semanales moderados obtienes
     los máximos beneficios para la salud mental."
```
