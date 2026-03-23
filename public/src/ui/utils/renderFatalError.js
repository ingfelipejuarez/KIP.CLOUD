/**
 * KIP · src/ui/utils/renderFatalError.js
 *
 * Renderiza un banner de error fatal en el contenedor indicado.
 * Reemplaza el bloque duplicado que existía en los 5 módulos de página.
 *
 * Correcciones aplicadas:
 *   [C-01] Usaba innerHTML con datos externos → ahora usa createElement + textContent.
 *   [W-03] Código duplicado en 5 archivos → módulo centralizado y reutilizable.
 *
 * @param {HTMLElement|null} container — elemento donde se inserta el banner (ej: #main).
 * @param {Error|unknown}    err       — el error capturado en el catch.
 * @param {object}           [opts]
 * @param {string}           [opts.customMsg] — mensaje personalizado; si no se pasa,
 *                                              se infiere del tipo de error.
 */
export function renderFatalError(container, err, opts = {}) {
  if (!container) return;

  // ── Resolver mensaje ──────────────────────────────────────────
  const msg = opts.customMsg
    ?? (err?.isNetworkError
      ? 'Sin conexión. Comprueba tu red y recarga la página.'
      : 'Ocurrió un error al cargar la página. Recarga para intentar de nuevo.');

  // ── Construir DOM sin innerHTML ───────────────────────────────
  // No se usa innerHTML ni concatenación de strings con datos externos.
  const wrap = document.createElement('div');
  wrap.className = 'fatal-error-banner';
  wrap.setAttribute('role', 'alert');
  wrap.style.cssText = [
    'margin:2rem auto',
    'max-width:480px',
    'padding:1.5rem',
    'background:var(--bg-1)',
    'border:1px solid var(--b-1)',
    'border-radius:var(--r-xl)',
    'text-align:center',
    'color:var(--tx-2)',
  ].join(';');

  const title = document.createElement('p');
  title.style.cssText = 'font-size:1.1rem;font-weight:500;color:var(--tx-1);margin-bottom:.5rem';
  title.textContent = 'Algo salió mal';  // string literal — no datos externos

  const detail = document.createElement('p');
  detail.style.cssText = 'font-size:.875rem;margin-bottom:1.25rem';
  detail.textContent = msg;              // textContent — nunca innerHTML

  const btn = document.createElement('button');
  btn.style.cssText = [
    'padding:.5rem 1.25rem',
    'background:var(--a)',
    'color:var(--tx-on-a)',
    'border-radius:var(--r-pill)',
    'font-weight:500',
    'cursor:pointer',
    'border:none',
  ].join(';');
  btn.textContent = 'Recargar';
  btn.addEventListener('click', () => location.reload());  // listener, no onclick inline

  wrap.append(title, detail, btn);
  container.prepend(wrap);
}
