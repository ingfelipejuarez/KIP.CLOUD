// KIP · src/middleware/csrf.js
// Implementa el patrón "double submit cookie" para protección CSRF.
//
// Al hacer login el servidor emite la cookie kip_csrf (NO httpOnly)
// El cliente debe reenviarla en el header X-CSRF-Token en requests mutantes.
// El servidor compara ambos valores. Dado que la cookie es same-site,
// una petición cross-origin no puede leerla y por tanto no puede reenviarla.

import { randomBytes } from 'crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Emite o renueva la cookie CSRF.
 * Llamar desde el controller de login.
 */
export function issueCsrfCookie(res) {
  const token = randomBytes(32).toString('hex');
  res.cookie('kip_csrf', token, {
    httpOnly: false,                          // debe ser legible por JS del cliente
    secure:   process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path:     '/',
    maxAge:   7 * 24 * 60 * 60 * 1000,       // 7 días
  });
  return token;
}

/**
 * Middleware: verifica el token CSRF en métodos mutantes.
 */
export function csrfMiddleware(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookieToken = req.cookies?.kip_csrf;
  const headerToken = req.headers?.['x-csrf-token'];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'CSRF token inválido' });
  }

  next();
}
