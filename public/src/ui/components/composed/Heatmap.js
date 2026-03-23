/** KIP · Heatmap — mapa de calor de actividad */
export const HeatmapComponent = {
  /**
   * @param {Array}  habitos
   * @param {string} gridId
   * @param {string} monthsId
   * @param {number} [days=91]
   */
  render(habitos = [], gridId = 'heatmap-grid', monthsId = 'heatmap-months', days = 91) {
    const grid   = document.getElementById(gridId);
    const months = document.getElementById(monthsId);
    if (!grid) return;

    const today = new Date();
    days = Math.max(7, Math.min(365, Number(days) || 91));
    const cells = [];
    const monthLabels = new Map();

    // [FIX-8] Calcular el nivel de actividad real a partir de los hábitos.
    // Antes usaba Math.random() — datos puramente aleatorios y distintos en
    // cada render. Ahora: nivel 0 (sin datos) si no hay hábitos cargados,
    // nivel 1-4 proporcional a la racha acumulada cuando los hay.
    // En el mock, la racha disponible es la racha actual del hábito, no el
    // historial completo por día (eso requeriría backend). Se usa como
    // aproximación honesta hasta que exista historial real.
    const maxRacha = habitos.length
      ? Math.max(...habitos.map(h => h.racha ?? 0), 1)
      : 1;

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);

      // Nivel basado en cuántos hábitos tienen racha que cubre este día.
      // Si racha >= (days - i), ese hábito "estaba activo" en ese día.
      let level = 0;
      if (habitos.length) {
        const daysAgo    = i; // días hacia atrás desde hoy
        const activos    = habitos.filter(h => (h.racha ?? 0) > daysAgo).length;
        const proporcion = activos / habitos.length;
        level = proporcion === 0 ? 0
              : proporcion < 0.25 ? 1
              : proporcion < 0.50 ? 2
              : proporcion < 0.75 ? 3
              : 4;
      }

      cells.push(`<div class="hm-cell hm-l${level}" title="${d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}"></div>`);

      if (d.getDate() === 1 || i === days - 1) {
        const mesNombre = d.toLocaleDateString('es-ES', { month: 'short' });
        monthLabels.set(days - 1 - i, mesNombre);
      }
    }

    grid.innerHTML = cells.join('');

    if (months) {
      months.innerHTML = '';
      // Cada celda mide 13px + 3px gap = 16px. Calculamos el offset en px
      // de cada inicio de mes y lo posicionamos con margin-left.
      const cellPx = 16;
      let lastEnd = -999; // evitar solapamiento entre etiquetas
      monthLabels.forEach((nombre, colIdx) => {
        const leftPx = colIdx * cellPx;
        // Saltar etiqueta si solaparía la anterior (ancho aprox. 7px/char)
        if (leftPx < lastEnd + 4) return;
        const span = document.createElement('span');
        span.textContent = nombre;
        span.className = 'hm-month-label';
        span.style.cssText = `position:absolute;left:${leftPx}px;white-space:nowrap;`;
        months.appendChild(span);
        lastEnd = leftPx + nombre.length * 7;
      });
      months.style.cssText = 'position:relative;height:14px;margin-bottom:6px;overflow:visible;';
    }
  },
};
