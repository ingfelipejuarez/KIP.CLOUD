// KIP · src/utils/validators.js
// Schemas de validación con Zod — espejo de las reglas del frontend

import { z } from 'zod';

export const registerSchema = z.object({
  email:    z.string().email('Email inválido').max(254),
  password: z.string()
    .min(8,  'Mínimo 8 caracteres')
    .max(128,'Máximo 128 caracteres')
    .regex(/[A-Z]/, 'Debe incluir al menos una mayúscula')
    .regex(/[0-9]/, 'Debe incluir al menos un número'),
  nombre:   z.string().min(2).max(80).regex(/^[a-zA-ZÀ-ÿ\s'\-\.]{1,80}$/, 'Nombre inválido'),
});

export const loginSchema = z.object({
  email:    z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
});

export const habitCreateSchema = z.object({
  nombre:      z.string().min(2, 'Mínimo 2 caracteres').max(48),
  frecuencia:  z.enum(['DIARIO','SEMANAL','MENSUAL']).default('DIARIO'),
  categoria:   z.enum(['BIENESTAR','SALUD','MENTE','SOCIAL','TRABAJO','GENERAL']).default('GENERAL'),
  nota:        z.string().max(80).optional().nullable(),
  metaSemanal: z.number().int().min(1).max(7).optional().nullable(),
  metaMensual: z.number().int().min(1).max(31).optional().nullable(),
});

export const habitUpdateSchema = habitCreateSchema.partial();

export const habitOrderSchema = z.object({
  orden: z.array(z.string().uuid()),  // array de IDs en el nuevo orden
});

export const userUpdateSchema = z.object({
  nombre:      z.string().min(2).max(80).optional(),
  tema:        z.string().max(30).optional(),
  timezone:    z.string().max(50).optional(),
  idioma:      z.enum(['es','en']).optional(),
  soundEnabled:z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string()
    .min(8).max(128)
    .regex(/[A-Z]/, 'Debe incluir al menos una mayúscula')
    .regex(/[0-9]/, 'Debe incluir al menos un número'),
});

// Helper para validar y lanzar error con código 400
export function validate(schema, data) {
  return schema.parse(data); // lanza ZodError si falla (capturado por errorHandler)
}
