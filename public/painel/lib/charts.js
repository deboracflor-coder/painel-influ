/* Gráficos em SVG puro (sem biblioteca): linha, barras empilhadas e minigráfico.
   Cada gráfico se registra para o tooltip de hover (crosshair em linha, coluna em barras). */
(function (root) {
  const registry = new Map();
  let seq = 0;
  const W = 720;

  function niceMax(v) {
    if (!(v > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function compact(v) {
    if (v >= 1e6) return (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
    if (v >= 1e3) return (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
    return v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  }
  const dm = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);

  // Gráfico de linha. series: [{name, color, values: (number|null)[]}], labels: ISO dates
  function line({ series, labels, height = 220, fmt = compact, area = series.length === 1, minZero = false }) {
    const id = 'ch' + (++seq);
    const H = height, L = 52, R = 14, T = 12, B = 26;
    const all = series.flatMap((s) => s.values).filter((v) => typeof v === 'number');
    if (!all.length) return `<div class="empty"><strong>Sem dados para o gráfico</strong><span>Nenhum valor disponível no período.</span></div>`;
    let lo = minZero ? 0 : Math.min(...all), hi = Math.max(...all);
    if (!minZero) { const pad = (hi - lo) * 0.15 || hi * 0.05 || 1; lo = Math.max(0, lo - pad); hi = hi + pad; }
    const step = niceMax((hi - lo) / 4);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const x = (i) => L + (labels.length === 1 ? (W - L - R) / 2 : (i / (labels.length - 1)) * (W - L - R));
    const y = (v) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
    let g = '';
    for (let v = lo; v <= hi + 1e-9; v += step) g += `<line class="gridline" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
    const ticks = Math.min(6, labels.length);
    for (let k = 0; k < ticks; k++) { const i = Math.round(k * (labels.length - 1) / Math.max(ticks - 1, 1)); g += `<text x="${x(i)}" y="${H - 6}" text-anchor="${k === 0 ? 'start' : k === ticks - 1 ? 'end' : 'middle'}">${dm(labels[i])}</text>`; }
    let paths = '';
    for (const s of series) {
      let d = '', started = false, first = null, last = null;
      s.values.forEach((v, i) => {
        if (typeof v !== 'number') { started = false; return; }
        d += (started ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' ';
        started = true; if (first === null) first = i; last = i;
      });
      if (area && first !== null) paths += `<path d="${d} L${x(last)} ${y(lo)} L${x(first)} ${y(lo)} Z" fill="${s.color}" opacity="0.12"/>`;
      paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (last !== null) paths += `<circle cx="${x(last)}" cy="${y(s.values[last])}" r="4" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`;
    }
    registry.set(id, { type: 'line', labels, series, fmt: (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }), x, y, L, R, H, T, B });
    return `<svg class="chart" data-chart="${id}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de linha: ${series.map((s) => s.name).join(', ')}">${g}<line class="baseline" x1="${L}" x2="${W - R}" y1="${y(lo)}" y2="${y(lo)}"/>${paths}<line class="cursor" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/><g class="hover-dots"></g><rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/></svg>`;
  }

  // Barras empilhadas. labels: categorias; series: [{name, color, values[]}]
  function stacked({ labels, series, height = 230, fmt = compact, labelFmt = (l) => l }) {
    const id = 'ch' + (++seq);
    const H = height, L = 52, R = 10, T = 12, B = 26;
    const totals = labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] || 0), 0));
    if (!totals.some((t) => t > 0)) return `<div class="empty"><strong>Sem dados para o gráfico</strong><span>Nenhum valor disponível no período.</span></div>`;
    const hi = niceMax(Math.max(...totals) * 1.05), step = hi / 4;
    const bw = (W - L - R) / labels.length, barW = Math.min(46, bw * 0.62);
    const y = (v) => T + (1 - v / hi) * (H - T - B);
    let g = '';
    for (let v = 0; v <= hi + 1e-9; v += step) g += `<line class="gridline" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
    let bars = '';
    const every = Math.ceil(labels.length / 8);
    labels.forEach((lab, i) => {
      const cx = L + bw * i + bw / 2, x0 = cx - barW / 2;
      let acc = 0;
      const segs = series.map((s) => ({ s, v: s.values[i] || 0 })).filter((z) => z.v > 0);
      segs.forEach((z, k) => {
        const y1 = y(acc + z.v), y0 = y(acc), h = y0 - y1;
        const top = k === segs.length - 1, rr = Math.min(4, h, barW / 2);
        const d = top
          ? `M${x0} ${y0} L${x0} ${y1 + rr} Q${x0} ${y1} ${x0 + rr} ${y1} L${x0 + barW - rr} ${y1} Q${x0 + barW} ${y1} ${x0 + barW} ${y1 + rr} L${x0 + barW} ${y0} Z`
          : `M${x0} ${y0} L${x0} ${y1} L${x0 + barW} ${y1} L${x0 + barW} ${y0} Z`;
        bars += `<path d="${d}" fill="${z.s.color}" stroke="var(--surface)" stroke-width="2" paint-order="stroke"/>`;
        acc += z.v;
      });
      if (i % every === 0) g += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${labelFmt(lab)}</text>`;
    });
    registry.set(id, { type: 'bars', labels, series, totals, bw, L, labelFmt, fmt: (v) => v.toLocaleString('pt-BR') });
    return `<svg class="chart" data-chart="${id}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de barras empilhadas">${g}${bars}<line class="baseline" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/><rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/></svg>`;
  }

  // Minigráfico (sem eixos) com ponto final destacado
  function spark(values, color, h = 44) {
    const pts = values.map((v, i) => [i, v]).filter(([, v]) => typeof v === 'number');
    if (pts.length < 2) return '<div class="muted small">Sem série suficiente</div>';
    const w = 220, lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1]));
    const x = (i) => 2 + (i / (values.length - 1)) * (w - 6), y = (v) => 3 + (1 - (v - lo) / (hi - lo || 1)) * (h - 8);
    const d = pts.map(([i, v], k) => (k ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
    const [li, lv] = pts[pts.length - 1];
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d} L${x(li)} ${h} L${x(pts[0][0])} ${h} Z" fill="${color}" opacity="0.12"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2"/><circle cx="${x(li)}" cy="${y(lv)}" r="3.5" fill="${color}"/></svg>`;
  }

  // Tooltip de hover: um único listener para todos os gráficos
  function attachHover(tooltipEl) {
    function place(e) {
      const pad = 14, r = tooltipEl.getBoundingClientRect();
      let left = e.clientX + pad, top = e.clientY + pad;
      if (left + r.width > window.innerWidth - 8) left = e.clientX - r.width - pad;
      if (top + r.height > window.innerHeight - 8) top = e.clientY - r.height - pad;
      tooltipEl.style.left = Math.max(8, left) + 'px'; tooltipEl.style.top = Math.max(8, top) + 'px';
    }
    document.addEventListener('pointermove', (e) => {
      const svg = e.target.closest && e.target.closest('svg[data-chart]');
      document.querySelectorAll('svg[data-chart] .cursor').forEach((c) => { if (!svg || !svg.contains(c)) c.setAttribute('visibility', 'hidden'); });
      if (!svg) { if (tooltipEl.dataset.src === 'chart') { tooltipEl.hidden = true; tooltipEl.dataset.src = ''; } return; }
      const c = registry.get(svg.dataset.chart);
      if (!c) return;
      const rect = svg.getBoundingClientRect();
      const vx = (e.clientX - rect.left) / rect.width * W;
      let html = '';
      if (c.type === 'line') {
        let best = 0, bd = Infinity;
        c.labels.forEach((_, i) => { const d = Math.abs(c.x(i) - vx); if (d < bd) { bd = d; best = i; } });
        const cur = svg.querySelector('.cursor');
        cur.setAttribute('x1', c.x(best)); cur.setAttribute('x2', c.x(best)); cur.setAttribute('visibility', 'visible');
        html = `<strong>${c.labels[best].split('-').reverse().join('/')}</strong>` + c.series.map((s) => `<div class="tt-row"><span><i class="dot" style="background:${s.color}"></i> ${s.name}</span><span>${typeof s.values[best] === 'number' ? c.fmt(s.values[best]) : 'sem dado'}</span></div>`).join('');
      } else {
        const i = Math.floor((vx - c.L) / c.bw);
        if (i < 0 || i >= c.labels.length) { tooltipEl.hidden = true; return; }
        html = `<strong>${c.labelFmt(c.labels[i], true)}</strong>` + c.series.filter((s) => s.values[i]).map((s) => `<div class="tt-row"><span><i class="dot" style="background:${s.color}"></i> ${s.name}</span><span>${c.fmt(s.values[i])}</span></div>`).join('') + `<div class="tt-row"><span>Total</span><span>${c.fmt(c.totals[i])}</span></div>`;
      }
      tooltipEl.innerHTML = html; tooltipEl.hidden = false; tooltipEl.dataset.src = 'chart'; place(e);
    });
  }

  function reset() { registry.clear(); }
  root.Charts = { line, stacked, spark, attachHover, reset, compact, niceMax };
})(typeof window !== 'undefined' ? window : globalThis);
