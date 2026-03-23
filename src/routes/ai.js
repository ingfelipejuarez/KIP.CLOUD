// KIP · src/routes/ai.js
// POST /api/v1/ai/chat  — proxy seguro hacia DeepSeek
// El frontend NUNCA toca la API key directamente en producción.
// Toda petición pasa por aquí: se verifica auth, se aplica rate limit,
// se inyecta el contexto del usuario y se hace streaming hacia el cliente.

import { Router }      from 'express';
import { requireAuth, requirePro } from '../middleware/auth.js';
import { aiChatLimiter }           from '../middleware/rateLimiter.js';
import { aiService }               from '../services/aiService.js';
import { z }                       from 'zod';

const router = Router();

// Todas las rutas de IA requieren auth
router.use(requireAuth);

// Si AI_REQUIRES_PREMIUM=true en .env, añadir requirePro
// (configurable para no bloquear durante desarrollo)
if (process.env.AI_REQUIRES_PREMIUM === 'true') {
  router.use(requirePro);
}

// POST /ai/chat — enviar mensaje y recibir respuesta streamed
router.post('/chat', aiChatLimiter, async (req, res, next) => {
  try {
    // Validar body
    const { messages } = z.object({
      messages: z.array(z.object({
        role:    z.enum(['user', 'assistant', 'system']),
        content: z.string().min(1).max(4000),
      })).min(1).max(40),   // máximo 40 turnos de historial
    }).parse(req.body);

    // Configurar headers para Server-Sent Events (streaming)
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // desactivar buffering en nginx

    // Limpiar si el cliente corta la conexión
    req.on('close', () => res.end());

    await aiService.streamChat(req.user.id, messages, res);

  } catch (err) { next(err); }
});

export default router;
