// KIP · src/config/jwt.js
// Firma y verificación de JSON Web Tokens

import jwt from 'jsonwebtoken';

const SECRET          = process.env.JWT_SECRET;
const EXPIRES_IN      = process.env.JWT_EXPIRES_IN      || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

if (!SECRET) {
  throw new Error('JWT_SECRET no definido en las variables de entorno');
}

/**
 * Genera un access token de corta duración (15min por defecto).
 * Payload mínimo: sub (userId), plan, nombre.
 */
export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, nombre: user.nombre, plan: user.plan },
    SECRET,
    { expiresIn: EXPIRES_IN, algorithm: 'HS256' }
  );
}

/**
 * Genera un refresh token de larga duración (7 días por defecto).
 * Payload mínimo: sub + jti (session ID único para revocación).
 */
export function signRefreshToken(userId, sessionId) {
  return jwt.sign(
    { sub: userId, jti: sessionId },
    SECRET,
    { expiresIn: REFRESH_EXPIRES, algorithm: 'HS256' }
  );
}

/**
 * Verifica y decodifica un token.
 * @throws {JsonWebTokenError | TokenExpiredError}
 */
export function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

/**
 * Calcula la fecha de expiración de un refresh token en ms.
 */
export function refreshExpiresAt() {
  const days = parseInt(REFRESH_EXPIRES) || 7;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
