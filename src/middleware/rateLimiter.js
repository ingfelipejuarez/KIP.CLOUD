// KIP · src/middleware/rateLimiter.js

import rateLimit from 'express-rate-limit';

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;

export const generalLimiter = rateLimit({
  windowMs,
  max:     parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { error: 'Demasiadas peticiones. Intenta más tarde.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

export const loginLimiter = rateLimit({
  windowMs,
  max:     parseInt(process.env.LOGIN_RATE_LIMIT_MAX) || 10,
  message: { error: 'Demasiados intentos de login. Espera 15 minutos.' },
  standardHeaders: true,
  legacyHeaders:   false,
  skipSuccessfulRequests: true,
});

// IA: máximo 30 mensajes por 15 minutos por usuario autenticado
export const aiChatLimiter = rateLimit({
  windowMs,
  max:     parseInt(process.env.AI_RATE_LIMIT_MAX) || 30,
  message: { error: 'Demasiados mensajes a la IA. Espera unos minutos.' },
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders:   false,
});
