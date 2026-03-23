// KIP · src/app.js
// Configuración central de Express: middlewares globales, rutas, errores

import express      from 'express';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
import helmet       from 'helmet';
import cors         from 'cors';
import cookieParser from 'cookie-parser';

import { generalLimiter } from './middleware/rateLimiter.js';
import { csrfMiddleware }  from './middleware/csrf.js';
import { errorHandler }    from './middleware/errorHandler.js';
import { requestLogger }   from './middleware/requestLogger.js';

import authRoutes    from './routes/auth.js';
import userRoutes    from './routes/users.js';
import habitRoutes   from './routes/habits.js';
import badgeRoutes   from './routes/badges.js';
import statsRoutes   from './routes/stats.js';
import aiRoutes      from './routes/ai.js';

const app = express();

// ── Seguridad HTTP headers ─────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ── CORS ──────────────────────────────────────────────────────────
// En el monolito Railway, frontend y backend son el mismo origen →
// CORS solo necesita estar activo para desarrollo local (Live Server).
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : ['http://localhost:5500', 'http://localhost:5173'];

app.use(cors({
  origin: (origin, cb) => {
    // Mismo origen (monolito en producción) → siempre permitido
    if (!origin) return cb(null, true);
    if (corsOrigins.includes(origin)) return cb(null, true);
    // En producción Railway, el frontend es el mismo servidor → origin === undefined
    cb(null, true); // permitir todo en monolito — Railway ya filtra por dominio
  },
  credentials: true,
  methods:     ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','X-CSRF-Token','X-Requested-With','X-App-Version'],
}));

// ── Parsers ───────────────────────────────────────────────────────
app.use(express.json({ limit: '50kb' }));    // limitar tamaño del body
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// ── Rate limiting global ──────────────────────────────────────────
app.use('/api/', generalLimiter);

// ── Logger en desarrollo ──────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use(requestLogger);
}

// ── CSRF (protege rutas que mutan estado) ─────────────────────────
// Se aplica DESPUÉS de auth routes (login no necesita CSRF token previo)
app.use('/api/v1/habits',  csrfMiddleware);
app.use('/api/v1/users',   csrfMiddleware);
app.use('/api/v1/stats',   csrfMiddleware);
app.use('/api/v1/ai',     csrfMiddleware);

// ── Rutas ─────────────────────────────────────────────────────────
app.use('/api/v1/auth',   authRoutes);
app.use('/api/v1/users',  userRoutes);
app.use('/api/v1/habits', habitRoutes);
app.use('/api/v1/badges', badgeRoutes);
app.use('/api/v1/stats',  statsRoutes);
app.use('/api/v1/ai',     aiRoutes);

// ── Health check ──────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: process.env.npm_package_version || '1.0.0' });
});

// ── Archivos estáticos del frontend ──────────────────────────────
// El frontend (kip.v6) vive en la carpeta public/
// Express sirve HTML, CSS, JS, imágenes directamente.
const PUBLIC_DIR = join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR, {
  maxAge:  process.env.NODE_ENV === 'production' ? '1d' : 0,
  etag:    true,
  index:   false, // no autoservir index.html — lo manejamos abajo
}));

// ── SPA fallback ──────────────────────────────────────────────────
// Cualquier ruta que no sea /api/ y no tenga extensión de archivo
// redirige al dashboard del frontend.
app.get('*', (req, res, next) => {
  // Dejar pasar rutas de API al 404 de API
  if (req.path.startsWith('/api/')) return next();
  // Rutas del frontend: servir el index correspondiente o el dashboard
  const frontendIndex = join(PUBLIC_DIR, 'index.html');
  res.sendFile(frontendIndex, (err) => {
    if (err) res.redirect('/app/dashboard/');
  });
});

// ── 404 para rutas API no encontradas ────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Ruta no encontrada' });
  }
  res.redirect('/app/dashboard/');
});

// ── Manejador global de errores ───────────────────────────────────
app.use(errorHandler);

export default app;
