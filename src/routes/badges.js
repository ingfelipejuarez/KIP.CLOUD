// KIP · src/routes/badges.js
// GET /api/v1/badges — todos los badges con estado del usuario

import { Router }      from 'express';
import { requireAuth } from '../middleware/auth.js';
import { badgeService }from '../services/badgeService.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const badges = await badgeService.getAll(req.user.id);
    res.json({ ok: true, data: badges });
  } catch (err) { next(err); }
});

export default router;
