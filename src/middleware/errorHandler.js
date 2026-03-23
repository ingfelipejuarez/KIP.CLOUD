// KIP · src/middleware/errorHandler.js
// Manejador global de errores. Nunca expone stack traces en producción.

import { Prisma } from '@prisma/client';

export function errorHandler(err, _req, res, _next) {
  // Log completo en servidor
  console.error('[Error]', err.message, err.stack ? `\n${err.stack}` : '');

  // Error de validación de Zod
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error:  'Datos inválidos',
      fields: err.errors.map(e => ({ campo: e.path.join('.'), mensaje: e.message })),
    });
  }

  // Errores de Prisma
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe un registro con esos datos' });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Recurso no encontrado' });
    }
  }

  // Error con código HTTP explícito (lanzado en controladores)
  if (err.statusCode) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Error genérico — no exponer detalles en producción
  const message = process.env.NODE_ENV === 'production'
    ? 'Error interno del servidor'
    : err.message;

  res.status(500).json({ error: message });
}

/**
 * Factory para errores con código HTTP.
 * Uso: throw createError(404, 'Hábito no encontrado')
 */
export function createError(statusCode, message) {
  const err  = new Error(message);
  err.statusCode = statusCode;
  return err;
}
