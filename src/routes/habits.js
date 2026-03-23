// KIP · src/routes/habits.js
// GET    /api/v1/habits
// POST   /api/v1/habits
// GET    /api/v1/habits/:id
// PUT    /api/v1/habits/:id
// PATCH  /api/v1/habits/:id
// DELETE /api/v1/habits/:id
// POST   /api/v1/habits/:id/toggle
// POST   /api/v1/habits/:id/archive
// PUT    /api/v1/habits/reorder
// GET    /api/v1/habits/history?days=91

import { Router }       from 'express';
import { requireAuth }  from '../middleware/auth.js';
import { habitService } from '../services/habitService.js';
import { validate, habitCreateSchema, habitUpdateSchema, habitOrderSchema } from '../utils/validators.js';

const router = Router();
router.use(requireAuth);

// GET /habits — listar todos los hábitos del usuario
router.get('/', async (req, res, next) => {
  try {
    const habits = await habitService.getAll(req.user.id);
    res.json({ ok: true, data: habits });
  } catch (err) { next(err); }
});

// GET /habits/history — historial para heatmap
router.get('/history', async (req, res, next) => {
  try {
    const days    = Math.min(365, Math.max(7, parseInt(req.query.days) || 91));
    const history = await habitService.getHistory(req.user.id, days);
    res.json({ ok: true, data: history });
  } catch (err) { next(err); }
});

// PUT /habits/reorder — guardar orden drag & drop
router.put('/reorder', async (req, res, next) => {
  try {
    const { orden } = validate(habitOrderSchema, req.body);
    await habitService.reorder(req.user.id, orden);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /habits/:id — obtener un hábito
router.get('/:id', async (req, res, next) => {
  try {
    const habit = await habitService.getById(req.user.id, req.params.id);
    res.json({ ok: true, data: habit });
  } catch (err) { next(err); }
});

// POST /habits — crear hábito
router.post('/', async (req, res, next) => {
  try {
    const data  = validate(habitCreateSchema, req.body);
    const habit = await habitService.create(req.user.id, data);
    res.status(201).json({ ok: true, data: habit });
  } catch (err) { next(err); }
});

// PUT /habits/:id — actualización completa
router.put('/:id', async (req, res, next) => {
  try {
    const data  = validate(habitCreateSchema, req.body);
    const habit = await habitService.update(req.user.id, req.params.id, data);
    res.json({ ok: true, data: habit });
  } catch (err) { next(err); }
});

// PATCH /habits/:id — actualización parcial
router.patch('/:id', async (req, res, next) => {
  try {
    const data  = validate(habitUpdateSchema, req.body);
    const habit = await habitService.update(req.user.id, req.params.id, data);
    res.json({ ok: true, data: habit });
  } catch (err) { next(err); }
});

// DELETE /habits/:id — eliminar permanentemente
router.delete('/:id', async (req, res, next) => {
  try {
    await habitService.delete(req.user.id, req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /habits/:id/toggle — marcar/desmarcar completado hoy
router.post('/:id/toggle', async (req, res, next) => {
  try {
    const result = await habitService.toggle(req.user.id, req.params.id);
    res.json({ ok: true, data: result });
  } catch (err) { next(err); }
});

// POST /habits/:id/archive — archivar (ocultar sin eliminar)
router.post('/:id/archive', async (req, res, next) => {
  try {
    await habitService.archive(req.user.id, req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
