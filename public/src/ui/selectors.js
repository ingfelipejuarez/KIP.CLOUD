/**
 * KIP · src/ui/selectors.js
 *
 * IDs del DOM usados en todos los módulos de página.
 * Centralizar aquí evita strings duplicados y facilita refactors.
 *
 * [FEAT-1] Completado con todos los IDs de activity.js y achievements.js
 * que antes usaban strings literales directamente.
 */
export const SEL = Object.freeze({
  // ── Navbar / layout ────────────────────────────────────────────
  SALUDO:           'saludo',
  NOMBRE_USUARIO:   'nombre-usuario',
  FECHA_HOY:        'fecha-hoy',
  MAIN:             'main',

  // ── Métricas hero (dashboard + habits) ────────────────────────
  NUM_COMPLETADOS:  'num-completados',
  DENOM_TOTAL:      'denom-total',
  DENOM_TOTAL_PAGE: 'denom-total-page',
  NUM_RACHA:        'num-racha',
  PROG_FILL_HERO:   'prog-fill-hero',
  PROG_PCT_HERO:    'prog-pct-hero',
  STATUS_CHIP:      'status-chip',

  // ── Grids de hábitos ───────────────────────────────────────────
  HABITS_GRID:       'habits-grid',
  HABITS_FULL_GRID:  'habits-full-grid',
  HABITS_FULL_EMPTY: 'habits-full-empty',
  HABITS_COUNT:      'habits-count',
  HABITS_SORT:       'habits-sort',
  DASH_HABITS_EMPTY: 'dash-habits-empty',

  // ── Botones de acción ──────────────────────────────────────────
  BTN_NUEVO_HABITO:   'btn-nuevo-habito',
  BTN_NUEVO_HABITO_2: 'btn-nuevo-habito-2',
  BTN_UPGRADE_AI:     'btn-upgrade-ai',

  // ── Activity (heatmap + stats) ─────────────────────────────────
  // [FEAT-1] Antes usados como strings literales en activity.js
  HEATMAP_GRID:     'heatmap-grid',
  HEATMAP_MONTHS:   'heatmap-months',
  HEATMAP_SUMMARY:  'heatmap-summary',
  HEATMAP_PILL:     'heatmap-pill',
  // [FIX] Eliminado NUM_RACHA_ACT duplicado — usar SEL.NUM_RACHA en activity.js

  // ── Achievements (badges + stats) ─────────────────────────────
  // [FEAT-1] Antes usados como strings literales en achievements.js
  BADGES_UNLOCKED:  'badges-unlocked',
  BADGES_LOCKED:    'badges-locked',
  ACH_STAT_UNLOCKED:'ach-stat-unlocked',
  ACH_STAT_LOCKED:  'ach-stat-locked',
  ACH_STAT_RACHA:   'ach-stat-racha',

  // ── AI chat ────────────────────────────────────────────────────
  AI_CHAT_WINDOW:   'ai-chat-window',
  AI_INPUT:         'ai-input',
  AI_SEND_BTN:      'ai-send-btn',
  AI_PREMIUM_GATE:  'ai-premium-gate',
  BTN_CLEAR_CHAT:   'btn-clear-chat',

  // ── Modales y overlays ─────────────────────────────────────────
  HABIT_MODAL:      'habit-modal',
  MODAL_BACKDROP:   'modal-backdrop',
  CTX_MENU:         'ctx-menu',

  // ── Account dropdown ───────────────────────────────────────────
  BTN_ACCOUNT:      'btn-account',
  ACCOUNT_DROP:     'account-drop',
});
