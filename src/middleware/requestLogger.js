// KIP · src/middleware/requestLogger.js
// Logger simple para desarrollo — no usar en producción (usar Morgan/Pino)

export function requestLogger(req, _res, next) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${req.method} ${req.path}`);
  next();
}
