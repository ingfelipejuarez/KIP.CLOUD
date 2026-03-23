/**
 * KIP · app/login/login.js                                     kip.v8
 * ─────────────────────────────────────────────────────────────────
 * Gestiona el formulario de login con seguridad de producción.
 *
 * Capas de seguridad aplicadas:
 *   - Validación centralizada con Validators (email + contraseña)
 *   - Sanitización de inputs con sanitizeText antes de procesar
 *   - Rate limiting en cliente (loginLimiter) con backoff exponencial
 *   - CSRF token inyectado por ApiClient en el header X-CSRF-Token
 *   - Token de sesión via TokenService (cookie httpOnly en prod)
 *   - Auto-refresh del token arrancado tras login exitoso
 *   - setLoading(false) en bloque finally (botón nunca queda bloqueado)
 */
import { ApiClient }         from '../../src/services/ApiClient.js';
import { TokenService }      from '../../src/services/TokenService.js';
import { KIP_CONFIG }        from '../../src/config.js';
import { Validators }        from '../../src/security/inputSanitizer.js';
import { sanitizeText }      from '../../src/security/inputSanitizer.js';
import { loginLimiter }      from '../../src/security/rateLimitClient.js';
import { safeRedirectUrl }   from '../../src/security/csrf.js';

// ── Elementos del DOM ─────────────────────────────────────────────
const emailInput    = document.getElementById('login-email');
const rememberCheck = document.getElementById('login-remember');
const passInput     = document.getElementById('login-password');
const loginBtn      = document.getElementById('login-btn');
const errorEl       = document.getElementById('login-error');
const mockBadge     = document.getElementById('mock-badge');

// Ocultar badge de modo demo en producción
if (KIP_CONFIG.USE_REAL_API && mockBadge) {
  mockBadge.style.display = 'none';
}

// ── Helpers UI ────────────────────────────────────────────────────

function setLoading(on) {
  loginBtn.disabled = on;
  loginBtn.classList.toggle('loading', on);
}

function showError(msg) {
  // textContent — nunca innerHTML con datos externos
  errorEl.textContent = msg;
  errorEl.classList.add('visible');
  emailInput.classList.add('login-input--error');
  passInput.classList.add('login-input--error');
}

function clearError() {
  errorEl.classList.remove('visible');
  emailInput.classList.remove('login-input--error');
  passInput.classList.remove('login-input--error');
}

function redirectToDashboard() {
  // Validar URL de destino para prevenir Open Redirect
  const params      = new URLSearchParams(location.search);
  const destination = safeRedirectUrl(params.get('next') ?? '../dashboard/');
  location.replace(destination);
}

// ── Mostrar mensaje de expiración de sesión si aplica ─────────────
(function checkSessionReason() {
  const params = new URLSearchParams(location.search);
  const reason = params.get('reason');
  if (reason === 'session_expired') {
    showError('Tu sesión ha expirado. Inicia sesión de nuevo.');
  } else if (reason === 'unauthorized') {
    showError('Acceso no autorizado. Por favor inicia sesión.');
  }
  // Mostrar mensaje de reset de contraseña exitoso
  const resetEl = document.getElementById('reset-success');
  if (resetEl && params.get('reset') === 'ok') {
    resetEl.style.display = 'block';
  }
})();

// ── Handler de login ──────────────────────────────────────────────

async function handleLogin() {
  clearError();

  // ── Rate limiting en cliente ─────────────────────────────────
  if (loginLimiter.isLocked()) {
    showError(`Demasiados intentos. Espera ${loginLimiter.getRetryAfterText()}.`);
    return;
  }

  // ── Sanitización antes de validar ────────────────────────────
  const email    = sanitizeText(emailInput.value.trim(), 254);
  const password = passInput.value; // contraseña: no sanitizar, solo validar longitud

  // ── Validación centralizada ──────────────────────────────────
  const emailResult = Validators.email(email);
  if (!emailResult.valid) {
    showError(emailResult.error);
    emailInput.focus();
    return;
  }

  if (!password) {
    showError('La contraseña es requerida.');
    passInput.focus();
    return;
  }
  if (password.length < 8) {
    showError('La contraseña debe tener al menos 8 caracteres.');
    passInput.focus();
    return;
  }
  if (password.length > 128) {
    showError('La contraseña es demasiado larga.');
    passInput.focus();
    return;
  }

  // Registrar intento ANTES de la petición
  const limitResult = loginLimiter.attempt();
  if (!limitResult.allowed) {
    showError(`Demasiados intentos. Espera ${loginLimiter.getRetryAfterText()}.`);
    return;
  }

  setLoading(true);

  try {
    if (KIP_CONFIG.USE_REAL_API) {
      // ── PRODUCCIÓN — backend real ─────────────────────────
      // ApiClient incluye el CSRF token y credentials:'include'
      // El servidor responde con cookie httpOnly — TokenService no almacena nada
      const remember = rememberCheck?.checked ?? false;
      await ApiClient.login(email, password, remember);

    } else {
      // ── MOCK — desarrollo sin backend ─────────────────────
      await new Promise(r => setTimeout(r, 400));

      const remember = rememberCheck?.checked ?? false;
      TokenService.save('kip-demo-token', remember);

      // Arrancar auto-refresh en modo mock (no-op pero coherente)
      TokenService.startAutoRefresh();

      // Nombre de UI extraído del email (solo para la interfaz)
      const nombre = sanitizeText(email.split('@')[0].replace(/[._-]/g, ' '), 80);
      try { localStorage.setItem(KIP_CONFIG.KEYS.NOMBRE, nombre); } catch (_) {}
    }

    // Login exitoso — resetear el rate limiter
    loginLimiter.success();
    redirectToDashboard();

  } catch (err) {
    console.error('[login] Error:', err);

    let msg;
    if (err.isNetworkError) {
      msg = err.isTimeout
        ? 'El servidor tardó demasiado. Comprueba tu conexión.'
        : 'Sin conexión. Comprueba tu red e inténtalo de nuevo.';
    } else if (err.status === 401 || err.status === 400) {
      msg = 'Email o contraseña incorrectos.';
    } else if (err.status === 429) {
      msg = 'Demasiados intentos en el servidor. Espera unos minutos.';
    } else if (err.status === 403) {
      msg = 'Cuenta bloqueada. Contacta con soporte.';
    } else {
      msg = 'Error del servidor. Inténtalo de nuevo.';
    }

    showError(msg);

    // Borrar contraseña del campo al fallar (nunca dejar en pantalla)
    passInput.value = '';
    passInput.focus();

  } finally {
    setLoading(false);
  }
}

// ── Eventos ───────────────────────────────────────────────────────

// [B-19] Guard completo en los tres bind points del módulo
loginBtn?.addEventListener('click', handleLogin);

[emailInput, passInput].filter(Boolean).forEach(el => {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
    clearError();
  });
});

// ── Auto-focus ────────────────────────────────────────────────────
// [B-19] Null-check defensivo: si el elemento no existe en el DOM
//        (script cargado en contexto incorrecto) no lanzar TypeError.
emailInput?.focus();
