/* Gráficos SVG sin dependencias (funcionan sin internet). */
const Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const tip = () => document.getElementById('tooltip');

  function el(name, attrs = {}, parent) {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  }

  function showTip(html, x, y) {
    const t = tip();
    t.innerHTML = html;
    t.classList.add('show');
    const r = t.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
    t.style.left = Math.max(8, left) + 'px';
    t.style.top = Math.max(8, top) + 'px';
  }
  function hideTip() { tip().classList.remove('show'); }

  function bindTip(node, htmlFn) {
    node.addEventListener('pointermove', e => showTip(htmlFn(), e.clientX, e.clientY));
    node.addEventListener('pointerleave', hideTip);
    node.addEventListener('pointerdown', e => showTip(htmlFn(), e.clientX, e.clientY));
  }

  // Rectángulo con esquinas redondeadas sólo en el extremo de datos.
  function barPathH(x, y, w, h, r) {
    r = Math.min(r, w, h / 2);
    if (w <= 0) return '';
    return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
  }
  function barPathV(x, y, w, h, r) {
    r = Math.min(r, h, w / 2);
    if (h <= 0) return '';
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * p;
  }

  function empty(container, msg) {
    container.innerHTML = `<p class="muted small center chart-empty">${msg}</p>`;
  }

  /* Barras horizontales: gasto por categoría con marca de límite. */
  function categoryBars(container, rows, fmt, fmtShort) {
    container.innerHTML = '';
    if (!rows.length) return empty(container, 'Todavía no hay egresos este mes.');
    const W = Math.max(container.clientWidth, 280);
    const labelW = Math.min(150, W * 0.36);
    const valueW = 78;
    const rowH = 34, barH = 16, top = 6;
    const H = top + rows.length * rowH + 4;
    const plotW = W - labelW - valueW;
    const max = niceMax(Math.max(...rows.map(r => Math.max(r.value, r.limit || 0))));
    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Gasto por categoría' }, container);

    rows.forEach((r, i) => {
      const y = top + i * rowH;
      const cy = y + rowH / 2;
      const t = el('text', { x: labelW - 10, y: cy, class: 'axis-label', 'text-anchor': 'end', 'dominant-baseline': 'middle' }, svg);
      t.textContent = `${r.icon || ''} ${r.label}`.trim();
      // pista
      el('rect', { x: labelW, y: cy - barH / 2, width: plotW, height: barH, rx: 4, class: 'track' }, svg);
      const w = (r.value / max) * plotW;
      const over = r.limit && r.value > r.limit;
      const near = r.limit && !over && r.value >= r.limit * r.threshold;
      const cls = over ? 'bar status-critical' : near ? 'bar status-warning' : 'bar series-1';
      if (w > 0) el('path', { d: barPathH(labelW, cy - barH / 2, w, barH, 4), class: cls }, svg);
      if (r.limit) {
        const lx = labelW + (r.limit / max) * plotW;
        el('line', { x1: lx, x2: lx, y1: cy - barH / 2 - 4, y2: cy + barH / 2 + 4, class: 'limit-mark' }, svg);
      }
      const v = el('text', { x: W - 4, y: cy, class: 'value-label', 'text-anchor': 'end', 'dominant-baseline': 'middle' }, svg);
      v.textContent = (over ? '⚠ ' : '') + fmtShort(r.value);
      const hit = el('rect', { x: 0, y, width: W, height: rowH, class: 'hit' }, svg);
      bindTip(hit, () => {
        let h = `<strong>${r.icon || ''} ${r.label}</strong><br>Gastado: ${fmt(r.value)}`;
        if (r.limit) {
          const pct = Math.round((r.value / r.limit) * 100);
          h += `<br>Límite: ${fmt(r.limit)} (${pct} %)`;
          h += r.value > r.limit ? `<br>⚠ Excedido por ${fmt(r.value - r.limit)}` : `<br>Disponible: ${fmt(r.limit - r.value)}`;
        }
        return h;
      });
    });
  }

  /* Barras agrupadas por mes: ingresos vs egresos. */
  function monthBars(container, months, fmt, fmtShort) {
    container.innerHTML = '';
    if (!months.some(m => m.ingresos || m.egresos)) return empty(container, 'Sin datos todavía.');
    const W = Math.max(container.clientWidth, 280);
    const H = 230;
    const m = { l: 56, r: 8, t: 10, b: 26 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const max = niceMax(Math.max(...months.map(x => Math.max(x.ingresos, x.egresos))));
    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Ingresos y egresos por mes' }, container);
    for (let k = 0; k <= 4; k++) {
      const y = m.t + ph - (k / 4) * ph;
      el('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, class: k === 0 ? 'baseline' : 'grid' }, svg);
      const t = el('text', { x: m.l - 6, y, class: 'axis-label small', 'text-anchor': 'end', 'dominant-baseline': 'middle' }, svg);
      t.textContent = fmtShort((max * k) / 4);
    }
    const gw = pw / months.length;
    const bw = Math.min(22, (gw - 14) / 2);
    months.forEach((mo, i) => {
      const gx = m.l + i * gw + gw / 2;
      const hi = (mo.ingresos / max) * ph, he = (mo.egresos / max) * ph;
      if (hi > 0) el('path', { d: barPathV(gx - bw - 1, m.t + ph - hi, bw, hi, 4), class: 'bar series-1' }, svg);
      if (he > 0) el('path', { d: barPathV(gx + 1, m.t + ph - he, bw, he, 4), class: 'bar series-2' }, svg);
      const t = el('text', { x: gx, y: H - 8, class: 'axis-label small', 'text-anchor': 'middle' }, svg);
      t.textContent = mo.label;
      const hit = el('rect', { x: gx - gw / 2, y: m.t, width: gw, height: ph, class: 'hit' }, svg);
      bindTip(hit, () => `<strong>${mo.labelLargo}</strong><br><span class="sw sw-1"></span>Ingresos: ${fmt(mo.ingresos)}<br><span class="sw sw-2"></span>Egresos: ${fmt(mo.egresos)}<br>Neto: ${fmt(mo.ingresos - mo.egresos)}`);
    });
  }

  /* Línea: saldo por día, con cruz y tooltip. */
  function balanceLine(container, points, fmt, fmtShort) {
    container.innerHTML = '';
    if (points.length < 2) return empty(container, 'Sin datos para este mes.');
    const W = Math.max(container.clientWidth, 280);
    const H = 220;
    const m = { l: 64, r: 12, t: 12, b: 26 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const ys = points.map(p => p.y);
    let lo = Math.min(...ys, 0), hi = Math.max(...ys);
    if (hi === lo) hi = lo + 1;
    hi = niceMax(hi);
    if (lo < 0) lo = -niceMax(-lo);
    const X = i => m.l + (i / (points.length - 1)) * pw;
    const Y = v => m.t + ph - ((v - lo) / (hi - lo)) * ph;
    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Evolución del saldo' }, container);
    for (let k = 0; k <= 4; k++) {
      const v = lo + ((hi - lo) * k) / 4;
      const y = Y(v);
      el('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, class: Math.abs(v) < 1e-9 ? 'baseline' : 'grid' }, svg);
      const t = el('text', { x: m.l - 6, y, class: 'axis-label small', 'text-anchor': 'end', 'dominant-baseline': 'middle' }, svg);
      t.textContent = fmtShort(v);
    }
    const step = Math.ceil(points.length / 6);
    points.forEach((p, i) => {
      if (i % step === 0 || i === points.length - 1) {
        const t = el('text', { x: X(i), y: H - 8, class: 'axis-label small', 'text-anchor': 'middle' }, svg);
        t.textContent = p.label;
      }
    });
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
    el('path', { d, class: 'line series-1' }, svg);
    const last = points[points.length - 1];
    el('circle', { cx: X(points.length - 1), cy: Y(last.y), r: 4, class: 'dot-end series-1' }, svg);

    const cross = el('line', { y1: m.t, y2: m.t + ph, class: 'crosshair', visibility: 'hidden' }, svg);
    const marker = el('circle', { r: 5, class: 'dot-end series-1', visibility: 'hidden' }, svg);
    const hit = el('rect', { x: m.l, y: m.t, width: pw, height: ph, class: 'hit' }, svg);
    const move = e => {
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const i = Math.max(0, Math.min(points.length - 1, Math.round(((x - m.l) / pw) * (points.length - 1))));
      const p = points[i];
      cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible');
      marker.setAttribute('cx', X(i)); marker.setAttribute('cy', Y(p.y)); marker.setAttribute('visibility', 'visible');
      showTip(`<strong>${p.labelLargo}</strong><br>Saldo: ${fmt(p.y)}`, e.clientX, e.clientY);
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => {
      cross.setAttribute('visibility', 'hidden'); marker.setAttribute('visibility', 'hidden'); hideTip();
    });
  }

  document.addEventListener('scroll', hideTip, { passive: true });
  return { categoryBars, monthBars, balanceLine, hideTip };
})();
