// KIP · src/services/authService.js
// Lógica de negocio de autenticación — separada del controller

import bcrypt      from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import prisma      from '../config/db.js';
import { signAccessToken, signRefreshToken, refreshExpiresAt, verifyToken } from '../config/jwt.js';
import { createError } from '../middleware/errorHandler.js';

const SALT_ROUNDS = 12;

export const authService = {

  async register({ email, password, nombre }) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw createError(409, 'El email ya está registrado');

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: { email, passwordHash, nombre },
      select: { id: true, email: true, nombre: true, plan: true },
    });
    return user;
  },

  async login({ email, password, userAgent, ipAddress }) {
    const user = await prisma.user.findUnique({ where: { email, deletedAt: null } });
    if (!user) throw createError(401, 'Email o contraseña incorrectos');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw createError(401, 'Email o contraseña incorrectos');

    const sessionId   = uuid();
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user.id, sessionId);

    await prisma.session.create({
      data: {
        id:           sessionId,
        userId:       user.id,
        refreshToken,
        userAgent:    userAgent || null,
        ipAddress:    ipAddress || null,
        expiresAt:    refreshExpiresAt(),
      },
    });

    return {
      user: { id: user.id, email: user.email, nombre: user.nombre, plan: user.plan },
      accessToken,
      refreshToken,
    };
  },

  async refresh(refreshToken) {
    let payload;
    try {
      payload = verifyToken(refreshToken);
    } catch {
      throw createError(401, 'Refresh token inválido o expirado');
    }

    const session = await prisma.session.findUnique({
      where: { refreshToken },
      include: { user: { select: { id: true, email: true, nombre: true, plan: true, deletedAt: true } } },
    });

    if (!session || session.expiresAt < new Date() || session.user.deletedAt) {
      throw createError(401, 'Sesión inválida o expirada');
    }

    // Rotar el refresh token (previene replay attacks)
    const newSessionId   = uuid();
    const newAccessToken  = signAccessToken(session.user);
    const newRefreshToken = signRefreshToken(session.user.id, newSessionId);

    await prisma.$transaction([
      prisma.session.delete({ where: { id: session.id } }),
      prisma.session.create({
        data: {
          id:           newSessionId,
          userId:       session.user.id,
          refreshToken: newRefreshToken,
          userAgent:    session.userAgent,
          ipAddress:    session.ipAddress,
          expiresAt:    refreshExpiresAt(),
        },
      }),
    ]);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  },

  async logout(refreshToken) {
    if (!refreshToken) return;
    await prisma.session.deleteMany({ where: { refreshToken } });
  },

  async logoutAll(userId) {
    await prisma.session.deleteMany({ where: { userId } });
  },
};
