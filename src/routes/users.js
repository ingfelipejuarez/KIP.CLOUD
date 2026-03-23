// KIP · src/routes/users.js
// GET    /api/v1/users/me
// PATCH  /api/v1/users/me
// POST   /api/v1/users/me/password
// DELETE /api/v1/users/me
// GET    /api/v1/users/me/export

import { Router }      from 'express';
import { requireAuth } from '../middleware/auth.js';
import { userService } from '../services/userService.js';
import { validate, userUpdateSchema, changePasswordSchema } from '../utils/validators.js';
import { sessionCookieOptions } from '../utils/cookieOptions.js';

const router = Router();
router.use(requireAuth);

// GET /users/me — perfil del usuario autenticado
router.get('/me', async (req, res, next) => {
  try {
    const user = await userService.getProfile(req.user.id);
    res.json({ ok: true, data: user });
  } catch (err) { next(err); }
});

// PATCH /users/me — actualizar perfil (nombre, tema, idioma, etc.)
router.patch('/me', async (req, res, next) => {
  try {
    const data = validate(userUpdateSchema, req.body);
    const user = await userService.updateProfile(req.user.id, data);
    res.json({ ok: true, data: user });
  } catch (err) { next(err); }
});

// POST /users/me/password — cambiar contraseña
router.post('/me/password', async (req, res, next) => {
  try {
    const data = validate(changePasswordSchema, req.body);
    await userService.changePassword(req.user.id, data);

    // Invalidar cookies de sesión — el usuario debe volver a iniciar sesión
    res.clearCookie('kip_session', sessionCookieOptions);
    res.clearCookie('kip_refresh', { ...sessionCookieOptions, path: '/api/v1/auth/refresh' });
    res.clearCookie('kip_authed');
    res.clearCookie('kip_csrf');

    res.json({ ok: true, message: 'Contraseña actualizada. Inicia sesión de nuevo.' });
  } catch (err) { next(err); }
});

// DELETE /users/me — eliminar cuenta (soft delete)
router.delete('/me', async (req, res, next) => {
  try {
    await userService.deleteAccount(req.user.id);

    res.clearCookie('kip_session', sessionCookieOptions);
    res.clearCookie('kip_refresh', { ...sessionCookieOptions, path: '/api/v1/auth/refresh' });
    res.clearCookie('kip_authed');
    res.clearCookie('kip_csrf');

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /users/me/export — exportar todos los datos (GDPR)
router.get('/me/export', async (req, res, next) => {
  try {
    const data = await userService.exportData(req.user.id);
    res.setHeader('Content-Disposition', 'attachment; filename="kip-data.json"');
    res.setHeader('Content-Type', 'application/json');
    res.json(data);
  } catch (err) { next(err); }
});

export default router;
