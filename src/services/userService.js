// KIP · src/services/userService.js

import bcrypt  from 'bcryptjs';
import prisma  from '../config/db.js';
import { createError } from '../middleware/errorHandler.js';

const SALT_ROUNDS = 12;

export const userService = {

  async getProfile(userId) {
    const user = await prisma.user.findUnique({
      where:  { id: userId, deletedAt: null },
      select: { id: true, email: true, nombre: true, plan: true,
                tema: true, timezone: true, idioma: true, soundEnabled: true,
                createdAt: true },
    });
    if (!user) throw createError(404, 'Usuario no encontrado');
    return user;
  },

  async updateProfile(userId, data) {
    return prisma.user.update({
      where:  { id: userId },
      data,
      select: { id: true, email: true, nombre: true, plan: true,
                tema: true, timezone: true, idioma: true, soundEnabled: true },
    });
  },

  async changePassword(userId, { currentPassword, newPassword }) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw createError(404, 'Usuario no encontrado');

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw createError(400, 'Contraseña actual incorrecta');

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    // Invalidar todas las sesiones excepto la actual
    await prisma.session.deleteMany({ where: { userId } });
  },

  async deleteAccount(userId) {
    // Soft delete — el email queda bloqueado, datos se purgan por job programado
    await prisma.user.update({
      where: { id: userId },
      data:  { deletedAt: new Date() },
    });
    // Invalidar todas las sesiones
    await prisma.session.deleteMany({ where: { userId } });
  },

  async exportData(userId) {
    const [user, habits, completions, badges] = await Promise.all([
      prisma.user.findUnique({
        where:  { id: userId },
        select: { email: true, nombre: true, plan: true, createdAt: true },
      }),
      prisma.habit.findMany({ where: { userId } }),
      prisma.habitCompletion.findMany({ where: { userId }, orderBy: { fecha: 'asc' } }),
      prisma.userBadge.findMany({
        where:   { userId },
        include: { badge: true },
      }),
    ]);

    return {
      exportado:   new Date().toISOString(),
      version:     '1.0',
      usuario:     user,
      habitos:     habits,
      completados: completions,
      logros:      badges.map(b => ({ ...b.badge, fechaLogro: b.fechaLogro })),
    };
  },
};
