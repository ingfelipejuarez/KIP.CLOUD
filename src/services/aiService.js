// KIP · src/services/aiService.js
// Proxy seguro hacia DeepSeek con RAG en dos capas:
//
//   Capa 1 — RAG estructurado: historial real del usuario desde PostgreSQL
//   Capa 2 — RAG vectorial:    base de conocimiento científica (pgvector)
//
// El frontend solo envía mensajes. El backend:
//   1. Recupera contexto personal del usuario (Capa 1)
//   2. Busca conocimiento científico relevante (Capa 2, si disponible)
//   3. Inyecta ambos en el system prompt
//   4. Hace proxy del streaming hacia el cliente

import prisma             from '../config/db.js';
import { createError }    from '../middleware/errorHandler.js';
import { ragStructured, ragVectorial } from './ragService.js';

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL    = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const MAX_TOKENS        = parseInt(process.env.AI_MAX_TOKENS)  || 1024;
const TEMPERATURE       = parseFloat(process.env.AI_TEMPERATURE) || 0.7;

export const aiService = {

  async streamChat(userId, messages, res) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw createError(503, 'Servicio de IA no configurado');

    // ── Extraer el último mensaje del usuario para el RAG vectorial
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';

    // ── Capa 1 + Capa 2 en paralelo ──────────────────────────────
    const [userContext, knowledgeContext] = await Promise.all([
      ragStructured.buildUserContext(userId),
      ragVectorial.search(lastUserMsg, 3),
    ]);

    // ── System prompt enriquecido con ambas capas ─────────────────
    const systemPrompt = buildSystemPrompt(userContext, knowledgeContext);

    // ── Filtrar mensajes del sistema que pudiera enviar el cliente
    const cleanMessages = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-20);

    const payload = {
      model:       DEEPSEEK_MODEL,
      messages:    [{ role: 'system', content: systemPrompt }, ...cleanMessages],
      stream:      true,
      max_tokens:  MAX_TOKENS,
      temperature: TEMPERATURE,
    };

    const upstream = await fetch(DEEPSEEK_ENDPOINT, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const errBody = await upstream.text().catch(() => '');
      console.error('[aiService] DeepSeek error:', upstream.status, errBody);
      if (upstream.status === 401) throw createError(503, 'API key de IA inválida');
      if (upstream.status === 429) throw createError(429, 'Límite de la IA alcanzado. Intenta en unos minutos.');
      throw createError(502, 'Error en el servicio de IA');
    }

    // ── Pipe del stream SSE: DeepSeek → cliente ───────────────────
    const reader  = upstream.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;
          res.write(`${trimmed}\n\n`);
        }
      }
    } finally {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  },
};

// ── Constructor del system prompt con RAG ─────────────────────────

function buildSystemPrompt(userContext, knowledgeContext) {
  const hasKnowledge = knowledgeContext && knowledgeContext.length > 0;

  return `Eres el asistente IA personal de KIP, una app de seguimiento de hábitos.
Hablas en español, eres conciso, empático y orientado a datos.
Solo respondes preguntas sobre hábitos, productividad y bienestar.

INSTRUCCIONES IMPORTANTES:
- Usa SIEMPRE los datos del CONTEXTO PERSONAL cuando respondas.
- Menciona días, porcentajes y nombres de hábitos específicos del usuario.
- Si hay CONOCIMIENTO CIENTÍFICO relevante, cítalo con su fuente entre paréntesis.
- Limita las respuestas a 180 palabras máximo.
- No inventes datos que no estén en el contexto.
- Si el usuario pregunta algo fuera de hábitos/bienestar, redirígelo amablemente.
- Cuando el usuario pregunte "¿cuándo fallo más?" o similares, usa los datos del patrón por día de semana.
- Cuando el usuario pregunte sobre formación de hábitos, menciona la investigación científica disponible.

${userContext}
${hasKnowledge ? '\n' + knowledgeContext : ''}`.trim();
}
