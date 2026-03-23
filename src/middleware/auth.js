// KIP · src/middleware/auth.js
// Verifica el JWT en cada request protegido.
// En producción el token viaja en cookie httpOnly.
// En desarrollo/mock acepta también Bearer en Authorization header.

import { verifyToken } from '../config/jwt.js';

export function requireAuth(req, res, next) {
  try {
    // 1. Cookie httpOnly (modo producción)
    let token = req.cookies?.kip_session;

    // 2. Bearer header (modo mock/desarrollo)
    if (!token) {
      const authHeader = req.headers['authorization'];
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }

    if (!token) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const payload = verifyToken(token);
    req.user = { id: payload.sub, nombre: payload.nombre, plan: payload.plan };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sesión expirada', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
}

/**
 * Middleware que exige plan PRO.
 * Usar después de requireAuth.
 */
export function requirePro(req, res, next) {
  if (req.user?.plan !== 'PRO') {
    return res.status(403).json({ error: 'Esta función requiere el plan PRO', code: 'REQUIRES_PRO' });
  }
  next();
}
