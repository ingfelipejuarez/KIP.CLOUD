// KIP · src/routes/stats.js
// GET /api/v1/stats/dashboard
// GET /api/v1/stats/activity?days=91

import { Router }      from 'express';
import { requireAuth } from '../middleware/auth.js';
import { statsService }from '../services/statsService.js';

const router = Router();
router.use(requireAuth);

router.get('/dashboard', async (req, res, next) => {
  try {
    const stats = await statsService.getDashboard(req.user.id);
    res.json({ ok: true, data: stats });
  } catch (err) { next(err); }
});

router.get('/activity', async (req, res, next) => {
  try {
    const days  = Math.min(365, Math.max(7, parseInt(req.query.days) || 91));
    const stats = await statsService.getActivity(req.user.id, days);
    res.json({ ok: true, data: stats });
  } catch (err) { next(err); }
});

export default router;
