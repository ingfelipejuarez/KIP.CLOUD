// KIP · src/routes/auth.js
// POST /api/v1/auth/register
// POST /api/v1/auth/login
// POST /api/v1/auth/refresh
// POST /api/v1/auth/logout

import { Router } from 'express';
import { authService }        from '../services/authService.js';
import { loginLimiter }       from '../middleware/rateLimiter.js';
import { issueCsrfCookie }    from '../middleware/csrf.js';
import { validate, loginSchema, registerSchema } from '../utils/validators.js';
import { sessionCookieOptions, authIndicatorOptions } from '../utils/cookieOptions.js';
import { requireAuth }        from '../middleware/auth.js';

const router = Router();

const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 días en ms
const ACCESS_MAX_AGE  = 15 * 60 * 1000;            // 15 min en ms

// ── POST /register ────────────────────────────────────────────────
router.post('/register', loginLimiter, async (req, res, next) => {
  try {
    const data = validate(registerSchema, req.body);
    const user = await authService.register(data);
    res.status(201).json({ ok: true, user });
  } catch (err) { next(err); }
});

// ── POST /login ───────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const data   = validate(loginSchema, req.body);
    const result = await authService.login({
      ...data,
      userAgent:  req.headers['user-agent'],
      ipAddress:  req.ip,
    });

    // Cookie httpOnly con el access token (15 min)
    res.cookie('kip_session', result.accessToken, {
      ...sessionCookieOptions,
      maxAge: ACCESS_MAX_AGE,
    });

    // Cookie httpOnly con el refresh token (7 días)
    res.cookie('kip_refresh', result.refreshToken, {
      ...sessionCookieOptions,
      path:   '/api/v1/auth/refresh', // scope mínimo
      maxAge: REFRESH_MAX_AGE,
    });

    // Cookie indicador público (JS puede leerla para saber si hay sesión)
    res.cookie('kip_authed', '1', {
      ...authIndicatorOptions,
      maxAge: REFRESH_MAX_AGE,
    });

    // Cookie CSRF (doble submit) — legible por JS del cliente
    issueCsrfCookie(res);

    res.json({ ok: true, user: result.user });
  } catch (err) { next(err); }
});

// ── POST /refresh ─────────────────────────────────────────────────
router.post('/refresh', async (req, res, next) => {
  try {
    const token  = req.cookies?.kip_refresh;
    if (!token) return res.status(401).json({ error: 'No hay refresh token' });

    const tokens = await authService.refresh(token);

    res.cookie('kip_session', tokens.accessToken, {
      ...sessionCookieOptions,
      maxAge: ACCESS_MAX_AGE,
    });
    res.cookie('kip_refresh', tokens.refreshToken, {
      ...sessionCookieOptions,
      path:   '/api/v1/auth/refresh',
      maxAge: REFRESH_MAX_AGE,
    });

    issueCsrfCookie(res);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── POST /logout ──────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.kip_refresh;
    await authService.logout(refreshToken);

    res.clearCookie('kip_session', sessionCookieOptions);
    res.clearCookie('kip_refresh', { ...sessionCookieOptions, path: '/api/v1/auth/refresh' });
    res.clearCookie('kip_authed');
    res.clearCookie('kip_csrf');

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── POST /logout-all ──────────────────────────────────────────────
router.post('/logout-all', requireAuth, async (req, res, next) => {
  try {
    await authService.logoutAll(req.user.id);
    res.clearCookie('kip_session', sessionCookieOptions);
    res.clearCookie('kip_refresh', { ...sessionCookieOptions, path: '/api/v1/auth/refresh' });
    res.clearCookie('kip_authed');
    res.clearCookie('kip_csrf');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
