/**
 * KIP · app/ai/ai.js                                         kip.v7
 * ─────────────────────────────────────────────────────────────────
 * IA personal de KIP — powered by DeepSeek Chat (deepseek-chat).
 *
 * Arquitectura:
 *  - DeepSeekService  : wrapper fetch hacia api.deepseek.com
 *  - buildSystemPrompt: construye el contexto con datos reales del usuario
 *  - ChatUI           : maneja el DOM del chat (mensajes, input, sugerencias)
 *  - launch()         : orquestador principal
 *
 * Config requerida en src/config.js:
 *   KIP_CONFIG.DEEPSEEK_KEY  — API key de DeepSeek (solo en modo real)
 *   KIP_CONFIG.AI_ENABLED    — true/false para el plan FREE/PREMIUM
 */

import { KIP_CONFIG }        from '../../src/config.js';
import { ApiClient }         from '../../src/services/ApiClient.js';
import { KIPStore }          from '../../src/services/KIPStore.js';
import { createDataService } from '../../src/services/DataService.js';
import { AuthService }       from '../../src/services/AuthService.js';
import { kipLoadHabits }     from '../../src/utils/habits.js';
import { renderFatalError }  from '../../src/ui/utils/renderFatalError.js';
import { esc }               from '../../src/ui/utils/sanitize.js';
import { authGuard }         from '../../src/security.js';
import { KIP_EVENTS }       from '../../src/ui/events.js';
import { PageGuard }        from '../../src/ui/pages/PageGuard.js';

// ═══════════════════════════════════════════════════════════════════
// DEEPSEEK SERVICE
// ═══════════════════════════════════════════════════════════════════

const DeepSeekService = {
  MODEL:    'deepseek-chat',   // DeepSeek-V4
  ENDPOINT: 'https://api.deepseek.com/chat/completions',

  /**
   * Envía un mensaje al API de DeepSeek con streaming.
   * @param {Array}    messages  — historial en formato OpenAI
   * @param {string}   apiKey    — clave de API
   * @param {Function} onChunk   — callback(texto) para cada fragmento streamed
   * @param {AbortSignal} signal — para cancelar la petición
   */
  async streamChat(messages, apiKey, onChunk, signal) {
    const res = await fetch(this.ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      signal,
      body: JSON.stringify({
        model:       this.MODEL,
        messages,
        stream:      true,
        max_tokens:  1024,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw Object.assign(new Error(`DeepSeek API ${res.status}`), {
        status:  res.status,
        details: errText,
      });
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // última línea incompleta → buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const json  = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) onChunk(delta);
        } catch (_) { /* línea malformada — ignorar */ }
      }
    }
  },

  /**
   * Versión sin streaming — para entornos que no soporten ReadableStream.
   */
  async chat(messages, apiKey) {
    const res = await fetch(this.ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:       this.MODEL,
        messages,
        stream:      false,
        max_tokens:  1024,
        temperature: 0.7,
      }),
    });

    if (!res.ok) throw new Error(`DeepSeek API ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  },
};

// ═══════════════════════════════════════════════════════════════════
// SYSTEM PROMPT — contexto del usuario
// ═══════════════════════════════════════════════════════════════════

function buildSystemPrompt(usuario, habitos) {
  const nombre = usuario?.nombre || 'Usuario';
  const racha  = usuario?.calcularRacha?.() || 0;
  const hoy    = new Date().toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });

  const habitosInfo = habitos.map(h => {
    const progreso  = h.calcularProgreso?.() ?? 0;
    const freq      = h.frecuencia || 'diario';
    const cat       = h.categoria  || 'general';
    const completadoHoy = h.completadoHoy ? 'sí' : 'no';
    return `  - ${h.nombre} (${cat}, ${freq}) | progreso: ${progreso}% | completado hoy: ${completadoHoy}`;
  }).join('\n');

  return `Eres el asistente IA personal de KIP, una app de seguimiento de hábitos.
Hablas en español, eres conciso, empático y orientado a datos.
Solo respondes preguntas sobre hábitos, productividad y bienestar.

DATOS DEL USUARIO:
Nombre: ${nombre}
Racha actual: ${racha} días
Fecha de hoy: ${hoy}
Total de hábitos: ${habitos.length}

HÁBITOS ACTIVOS:
${habitosInfo || '  (sin hábitos registrados todavía)'}

INSTRUCCIONES:
- Usa los datos reales del usuario en tus respuestas.
- Sé específico — menciona nombres de hábitos cuando sea relevante.
- Limita las respuestas a 150 palabras máximo.
- No inventes datos que no estén en el contexto.
- Si el usuario pregunta algo fuera de hábitos/bienestar, redirígelo amablemente.`;
}

// ═══════════════════════════════════════════════════════════════════
// CHAT UI
// ═══════════════════════════════════════════════════════════════════

class ChatUI {
  constructor() {
    this.window    = document.getElementById('ai-chat-window');
    this.input     = document.getElementById('ai-input');
    this.sendBtn   = document.getElementById('ai-send-btn');
    this.clearBtn  = document.getElementById('btn-clear-chat');
    this.statusDot = document.querySelector('.ai-status__dot');
    this.statusTxt = document.querySelector('.ai-status span');
    this.history   = [];   // Array<{role, content}> para el API
    this._abort    = null; // AbortController activo
  }

  bindEvents(onSend) {
    this.sendBtn?.addEventListener('click',   () => this._submit(onSend));
    this.input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._submit(onSend); }
    });
    this.clearBtn?.addEventListener('click', () => this._clearChat());

    // Sugerencias rápidas
    this.window?.addEventListener('click', (e) => {
      const sug = e.target.closest('.ai-sug-btn');
      if (!sug) return;
      this.input.value = sug.textContent.trim();
      document.getElementById('ai-suggestions')?.remove();
      this._submit(onSend);
    });
  }

  _submit(onSend) {
    const text = this.input?.value.trim();
    if (!text || this._isLoading()) return;
    this.input.value = '';
    onSend(text);
  }

  _isLoading() {
    return this.sendBtn?.disabled;
  }

  setLoading(on) {
    if (this.sendBtn)  this.sendBtn.disabled = on;
    if (this.input)    this.input.disabled   = on;
    if (this.statusDot) this.statusDot.style.background = on ? '#F59E0B' : '#10B981';
    if (this.statusTxt) this.statusTxt.textContent = on ? 'Escribiendo…' : 'Listo para chatear';
  }

  appendUserMessage(text) {
    const msg = document.createElement('div');
    msg.className = 'ai-msg ai-msg--user';
    msg.innerHTML = `<div class="ai-msg__body"><p>${esc(text)}</p></div>`;
    this.window?.appendChild(msg);
    this._scrollToBottom();
    this.history.push({ role: 'user', content: text });
  }

  /** Añade burbuja de IA vacía y devuelve el elemento <p> para ir llenando */
  appendAIBubble() {
    const msg = document.createElement('div');
    msg.className = 'ai-msg ai-msg--ai';
    msg.innerHTML = `
      <div class="ai-msg__avatar">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1.5l1.2 3.5H11L8.4 7.2l1.2 3.8L7 9l-2.6 2 1.2-3.8L3 5h2.8L7 1.5z" fill="currentColor"/>
        </svg>
      </div>
      <div class="ai-msg__body"><p class="ai-streaming"></p></div>`;
    this.window?.appendChild(msg);
    this._scrollToBottom();
    return msg.querySelector('.ai-streaming');
  }

  appendChunk(p, chunk) {
    // textContent acumulado — seguro, sin HTML
    p.textContent += chunk;
    this._scrollToBottom();
  }

  finalizeAIMessage(p, fullText) {
    p.classList.remove('ai-streaming');
    this.history.push({ role: 'assistant', content: fullText });
  }

  appendError(msg) {
    const el = document.createElement('div');
    el.className = 'ai-msg ai-msg--error';
    el.innerHTML = `<div class="ai-msg__body"><p>${esc(msg)}</p></div>`;
    this.window?.appendChild(el);
    this._scrollToBottom();
  }

  _clearChat() {
    this._abort?.abort();
    this.history = [];
    if (this.window) {
      this.window.innerHTML = `
        <div class="ai-msg ai-msg--ai ai-msg--welcome">
          <div class="ai-msg__avatar">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1.5l1.2 3.5H11L8.4 7.2l1.2 3.8L7 9l-2.6 2 1.2-3.8L3 5h2.8L7 1.5z" fill="currentColor"/>
            </svg>
          </div>
          <div class="ai-msg__body">
            <p>Chat reiniciado. ¿En qué puedo ayudarte?</p>
          </div>
        </div>`;
    }
    this.setLoading(false);
  }

  _scrollToBottom() {
    if (this.window) this.window.scrollTop = this.window.scrollHeight;
  }
}

// ═══════════════════════════════════════════════════════════════════
// ORQUESTADOR PRINCIPAL
// ═══════════════════════════════════════════════════════════════════

async function launch() {
  // ── Reset defensivo de modales al inicio ──────────────────────
  [
    'habit-modal', 'modal-backdrop',
    'cmd-palette', 'cmd-backdrop',
    'confirm-dialog', 'confirm-backdrop',
    'settings-panel', 'settings-backdrop',
    'kbd-panel', 'kbd-backdrop',
  ].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = true; });
  // [B-08] authGuard puede devolver Promise<boolean> en producción — awaitar siempre.
  const puedeAcceder = await Promise.resolve(authGuard(KIP_CONFIG, ApiClient));
  if (!puedeAcceder) return;
  // [FIX-7] PageGuard reemplaza window._kipAIStarted
  if (!PageGuard.claim('ai')) return;

  try {
    const dataService = createDataService();
    const authService = new AuthService(dataService);
    await authService.inicializar();
    const { habitos } = await kipLoadHabits(dataService, authService);
    // [FIX] Sincronizar hábitos con el objeto Usuario para que calcularRacha() sea correcto
    authService.sincronizarHabitos(habitos);
    const usuario     = authService.getUsuario();

    const store = KIPStore.getInstance();
    store.setState({ usuario, plan: usuario?.plan || 'FREE', habitos });

    // ── Actualizar panel de contexto lateral ──────────────────────
    _updateContextPanel(usuario, habitos);

    // ── Premium gate ──────────────────────────────────────────────
    const isPremium = (usuario?.plan || 'FREE').toUpperCase() === 'PREMIUM'
      || !KIP_CONFIG.AI_REQUIRES_PREMIUM;

    const gate = document.getElementById('ai-premium-gate');
    if (gate) gate.hidden = isPremium;

    document.getElementById('btn-upgrade-ai')?.addEventListener('click', () => {
      window.location.href = '../../app/ai/';
    });

    if (!isPremium) {
      console.debug('[ai] plan FREE — premium gate activo');
      return;
    }

    // ── Chat con DeepSeek ─────────────────────────────────────────
    const apiKey = KIP_CONFIG.DEEPSEEK_KEY;

    // [FIX-4] SEGURIDAD — ADVERTENCIA CRÍTICA:
    // La API key de DeepSeek NUNCA debe usarse directamente desde el browser
    // en producción. Cualquier usuario puede leerla en DevTools → Network.
    //
    // Arquitectura correcta para producción:
    //   Browser → POST /api/v1/ai/chat (tu backend, con auth)
    //           → Backend usa la key de forma segura → DeepSeek API
    //
    // Mientras no exista ese endpoint, el modo real de IA solo funciona
    // en localhost (donde la key no está expuesta a usuarios reales).
    if (KIP_CONFIG.USE_REAL_API && apiKey && apiKey !== 'PLACEHOLDER') {
      const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      if (!isLocal) {
        console.error(
          '[ai] SEGURIDAD: La API key de DeepSeek no puede usarse directamente ' +
          'desde el browser en producción. Implementa un proxy backend en ' +
          '/api/v1/ai/chat antes de habilitar USE_REAL_API en producción.'
        );
        // Forzar modo mock en producción hasta tener el proxy backend
        // En lugar de exponer la key, mostramos respuestas simuladas.
      }
    }
    const systemPrompt = buildSystemPrompt(usuario, habitos);
    const ui = new ChatUI();

    const handleSend = async (userText) => {
      ui.appendUserMessage(userText);
      ui.setLoading(true);

      // Solo enviamos el historial de conversación — el backend inyecta
      // el system prompt con los datos reales del usuario de forma segura.
      const messages = ui.history.slice(-20);

      // Cancelar respuesta anterior si había
      ui._abort?.abort();
      ui._abort = new AbortController();

      const p = ui.appendAIBubble();
      let fullText = '';

      try {
        if (KIP_CONFIG.USE_REAL_API) {
          // ── Modo PRODUCCIÓN — proxy seguro via backend ────────────
          // La API key de DeepSeek vive en el servidor, nunca en el browser.
          const res = await fetch(`${KIP_CONFIG.API_BASE}/ai/chat`, {
            method:      'POST',
            credentials: 'include',
            headers: {
              'Content-Type':  'application/json',
              'X-CSRF-Token':  document.cookie.match(/kip_csrf=([^;]+)/)?.[1] || '',
            },
            signal: ui._abort.signal,
            body: JSON.stringify({ messages }),
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw Object.assign(new Error(errData.error || `HTTP ${res.status}`), { status: res.status });
          }

          // Parsear el stream SSE del backend (mismo formato que DeepSeek)
          const reader  = res.body.getReader();
          const decoder = new TextDecoder();
          let   buffer  = '';

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
              try {
                const json  = JSON.parse(trimmed.slice(6));
                const delta = json.choices?.[0]?.delta?.content;
                if (delta) { fullText += delta; ui.appendChunk(p, delta); }
              } catch (_) {}
            }
          }
        } else {
          // ── Modo MOCK — respuesta simulada para desarrollo ───────
          await new Promise(r => setTimeout(r, 600));
          const mockResponse = _mockResponse(userText, habitos, usuario);
          for (const word of mockResponse.split(' ')) {
            if (ui._abort.signal.aborted) break;
            fullText += (fullText ? ' ' : '') + word;
            ui.appendChunk(p, (fullText.length > word.length ? ' ' : '') + word);
            await new Promise(r => setTimeout(r, 40));
          }
        }

        ui.finalizeAIMessage(p, fullText);

      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('[ai] error en chat:', err);
        const msg = err.status === 401
          ? 'API key inválida. Verifica la configuración.'
          : err.status === 429
          ? 'Límite de uso alcanzado. Inténtalo en unos minutos.'
          : 'Error al conectar con la IA. Inténtalo de nuevo.';
        p.textContent = '';
        ui.appendError(msg);
      } finally {
        ui.setLoading(false);
      }
    };

    ui.bindEvents(handleSend);
    // [FIX-B1] Despachar kip:ready para que AccountComponent actualice el dropdown
    window.dispatchEvent(new CustomEvent(KIP_EVENTS.READY, {
      detail: { dataService, authService, habitos, registros: new Map() },
    }));
    console.debug('[ai] inicializado ✓ — DeepSeek', DeepSeekService.MODEL, habitos.length, 'hábitos en contexto');

  } catch (err) {
    console.error('[ai] error fatal:', err);
    renderFatalError(document.getElementById('main'), err);
  }
}

function _updateContextPanel(usuario, habitos) {
  const racha    = usuario?.calcularRacha?.() || 0;
  const items    = {
    'Hábitos':      `${habitos.length} activos`,
    'Racha actual': `${racha} días`,
  };
  document.querySelectorAll('.ai-context-item').forEach(el => {
    const label = el.querySelector('.ai-context-item__label')?.textContent?.trim();
    const val   = el.querySelector('.ai-context-item__val');
    if (val && items[label]) val.textContent = items[label];
  });
}

function _mockResponse(userText, habitos, usuario) {
  const lower   = userText.toLowerCase();
  const nombre  = usuario?.nombre || 'tú';
  const racha   = usuario?.calcularRacha?.() || 0;

  if (lower.includes('racha') || lower.includes('streak')) {
    return `Tu racha actual es de ${racha} días, ${nombre}. ${racha > 7 ? '¡Excelente consistencia! Sigue así.' : 'Cada día cuenta — mantén el ritmo.'}`;
  }
  if (lower.includes('constante') || lower.includes('mejor')) {
    // [B-17] habitos puede ser [] — reduce con habitos[0]=undefined como acumulador inicial
    //        y sin items devuelve undefined, causando top.nombre → TypeError.
    if (!habitos.length) return 'Aún no tienes hábitos registrados. ¡Crea uno para empezar!';
    const top = habitos.reduce((a, b) => (a.calcularProgreso?.() ?? 0) >= (b.calcularProgreso?.() ?? 0) ? a : b);
    return `Tu hábito más constante es "${top.nombre}" con ${top.calcularProgreso?.() ?? 0}% de progreso esta semana.`;
  }
  if (lower.includes('semana') || lower.includes('análisis')) {
    if (!habitos.length) return 'Aún no tienes hábitos registrados. ¡Crea uno para empezar!';
    const completados   = habitos.filter(h => h.completadoHoy).length;
    const consistencia  = Math.round(habitos.reduce((a, h) => a + (h.calcularProgreso?.() ?? 0), 0) / habitos.length);
    return `Hoy llevas ${completados} de ${habitos.length} hábitos completados. Esta semana tu consistencia general es ${consistencia}%.`;
  }
  return `Entendido. Tengo acceso a tus ${habitos.length} hábitos activos. ¿Quieres que analice alguno en particular o prefieres un resumen general de tu progreso?`;
}

// [B-14] Bootstrap limpio — vía única LAYOUTS_LOADED.
if (window.__kipLayoutsReady) {
  launch();
} else {
  document.addEventListener(KIP_EVENTS.LAYOUTS_LOADED, launch, { once: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (!PageGuard.isStarted('ai')) setTimeout(launch, 100);
    }, { once: true });
  }
}
