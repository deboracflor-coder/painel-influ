/* Cálculos do dashboard. Fonte única das fórmulas documentadas em docs/07-formulas.md.
   Regra geral: métrica indisponível é null, nunca 0. Somas ignoram null e
   devolvem null quando nenhum item tem o dado. */
(function (root) {
  const METRICS = ['reach', 'impressions', 'views', 'likes', 'comments', 'shares', 'saves', 'clicks', 'follows', 'watch_time_min'];

  // Base da taxa de engajamento por plataforma (configurável em Parâmetros)
  const DEFAULT_ER_BASE = { instagram: 'reach', facebook: 'reach', tiktok: 'views', youtube: 'views', linkedin: 'impressions' };

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  function sum(items, get) {
    let total = 0, found = false;
    for (const it of items) {
      const v = get(it);
      if (isNum(v)) { total += v; found = true; }
    }
    return found ? total : null;
  }

  // Engajamento = curtidas + comentários + compartilhamentos + salvamentos (componentes disponíveis)
  function engagement(m) {
    const parts = [m.likes, m.comments, m.shares, m.saves].filter(isNum);
    return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
  }

  function erBaseFor(platform, cfg) {
    return ((cfg && cfg.erBase) || DEFAULT_ER_BASE)[platform] || 'reach';
  }

  // Taxa de engajamento de um post (%): engajamento / base da plataforma × 100
  function postER(post, cfg) {
    const base = post.metrics[erBaseFor(post.platform, cfg)];
    const eng = engagement(post.metrics);
    if (!isNum(base) || base <= 0 || !isNum(eng)) return null;
    return (eng / base) * 100;
  }

  // Taxa agregada (%): Σ engajamentos / Σ bases. Ponderada; não é média de taxas.
  function aggregateER(posts, cfg) {
    let eng = 0, base = 0, n = 0;
    for (const p of posts) {
      const b = p.metrics[erBaseFor(p.platform, cfg)];
      const e = engagement(p.metrics);
      if (isNum(b) && b > 0 && isNum(e)) { eng += e; base += b; n++; }
    }
    return n ? (eng / base) * 100 : null;
  }

  // Variação percentual; null quando não há base de comparação
  function pctChange(cur, prev) {
    if (!isNum(cur) || !isNum(prev) || prev === 0) return null;
    return ((cur - prev) / Math.abs(prev)) * 100;
  }

  // Datas em ISO 'YYYY-MM-DD', sempre em UTC para evitar fuso
  const DAY = 86400000;
  const toDate = (s) => new Date(s + 'T00:00:00Z');
  const toISO = (d) => d.toISOString().slice(0, 10);
  function addDays(iso, n) { return toISO(new Date(toDate(iso).getTime() + n * DAY)); }
  function daysBetween(a, b) { return Math.round((toDate(b) - toDate(a)) / DAY) + 1; } // inclusivo

  // Período anterior equivalente: mesmo número de dias, imediatamente antes
  function previousPeriod(start, end) {
    const len = daysBetween(start, end);
    const prevEnd = addDays(start, -1);
    return { start: addDays(prevEnd, -(len - 1)), end: prevEnd };
  }

  function inPeriod(iso, start, end) { const d = iso.slice(0, 10); return d >= start && d <= end; }

  // Seguidores no fim do período e ganho líquido no período
  function followersAt(daily, accountId, iso) {
    let best = null;
    for (const r of daily) {
      if (r.account_id !== accountId || r.day > iso || !isNum(r.followers)) continue;
      if (!best || r.day > best.day) best = r;
    }
    return best ? best.followers : null;
  }
  function followerGrowth(daily, accountIds, start, end) {
    let endTotal = 0, startTotal = 0, ok = false;
    for (const id of accountIds) {
      const e = followersAt(daily, id, end);
      const s = followersAt(daily, id, addDays(start, -1));
      if (isNum(e) && isNum(s)) { endTotal += e; startTotal += s; ok = true; }
    }
    if (!ok) return { followers: null, gained: null, pct: null };
    return { followers: endTotal, gained: endTotal - startTotal, pct: pctChange(endTotal, startTotal) };
  }

  // Totais de um conjunto de posts
  function totals(posts, cfg) {
    const t = { posts: posts.length };
    for (const k of METRICS) t[k] = sum(posts, (p) => p.metrics[k]);
    t.engagement = sum(posts, (p) => engagement(p.metrics));
    t.er = aggregateER(posts, cfg);
    t.avgViews = posts.length && isNum(t.views) ? t.views / posts.filter((p) => isNum(p.metrics.views)).length : null;
    t.avgEngagement = posts.length && isNum(t.engagement) ? t.engagement / posts.length : null;
    return t;
  }

  // ---------- EMV / valor equivalente de mídia (ESTIMATIVA) ----------
  // Para cada post: encontra o parâmetro vigente (plataforma + formato, ou só plataforma)
  // basis impressions/views/reach: valor = métrica / 1000 × CPM
  // basis engagements:             valor = engajamentos × valor por engajamento
  function findParam(params, post) {
    const d = post.published_at.slice(0, 10);
    const valid = params.filter((p) => p.platform === post.platform && isNum(p.rate) && p.rate > 0 &&
      (!p.valid_from || p.valid_from <= d) && (!p.valid_to || p.valid_to >= d));
    return valid.find((p) => p.format === post.format) || valid.find((p) => !p.format) || null;
  }
  function emvForPost(post, params) {
    const prm = findParam(params, post);
    if (!prm) return { value: null, reason: 'sem_parametro' };
    const base = prm.basis === 'engagements' ? engagement(post.metrics) : post.metrics[prm.basis];
    if (!isNum(base)) return { value: null, reason: 'sem_metrica_base', param: prm };
    const value = prm.basis === 'engagements' ? base * prm.rate : (base / 1000) * prm.rate;
    return { value, param: prm };
  }
  function emv(posts, params) {
    let total = 0, covered = 0;
    const missing = { sem_parametro: 0, sem_metrica_base: 0 };
    const byPlatform = {};
    for (const p of posts) {
      const r = emvForPost(p, params);
      if (r.value === null) { missing[r.reason]++; continue; }
      total += r.value; covered++;
      byPlatform[p.platform] = (byPlatform[p.platform] || 0) + r.value;
    }
    return { total: covered ? total : null, covered, missing, byPlatform, estimate: true };
  }

  // ---------- Entregas ----------
  // Realizado por linha de entrega = posts vinculados (ou quantidade manual p/ eventos)
  function deliveryProgress(deliverables, posts) {
    const lines = deliverables.map((d) => {
      const linked = posts.filter((p) => p.deliverable_id === d.id).length;
      const delivered = d.platform ? linked : (isNum(d.delivered_manual) ? d.delivered_manual : 0);
      const expected = d.expected - (d.cancelled || 0); // unidades canceladas saem do contratado
      return { ...d, expected, contracted: d.expected, delivered, manual: !d.platform, complete: delivered >= expected };
    });
    const expected = lines.reduce((a, l) => a + l.expected, 0);
    const counted = lines.reduce((a, l) => a + Math.min(l.delivered, l.expected), 0);
    return { lines, expected, counted, extra: lines.reduce((a, l) => a + l.delivered, 0) - counted, delivered: lines.reduce((a, l) => a + l.delivered, 0), pct: expected ? (counted / expected) * 100 : null, allComplete: lines.length > 0 && lines.every((l) => l.complete) };
  }

  // ---------- Investimento x resultado ----------
  function investment(fin) {
    if (!fin) return null;
    return sum([fin.contract_value, fin.media_value, fin.product_value].map((v) => ({ v })), (x) => x.v);
  }
  function businessIndicators(fin, t, emvTotal) {
    const inv = investment(fin);
    return {
      investment: inv,
      cpmViews: isNum(inv) && isNum(t.views) && t.views > 0 ? (inv / t.views) * 1000 : null,   // custo por mil views (real)
      costPerEngagement: isNum(inv) && isNum(t.engagement) && t.engagement > 0 ? inv / t.engagement : null,
      roiEstimated: isNum(inv) && inv > 0 && isNum(emvTotal) ? ((emvTotal - inv) / inv) * 100 : null, // estimativa
    };
  }

  // ---------- Formatos ----------
  function byFormat(posts, cfg) {
    const groups = {};
    for (const p of posts) (groups[p.format] = groups[p.format] || []).push(p);
    return Object.entries(groups).map(([format, ps]) => ({ format, ...totals(ps, cfg) }));
  }

  // Ranking: ordena por métrica (null sempre por último)
  function rank(posts, key, cfg) {
    const val = (p) => key === 'engagement' ? engagement(p.metrics) : key === 'er' ? postER(p, cfg) : p.metrics[key];
    return [...posts].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (!isNum(va) && !isNum(vb)) return 0;
      if (!isNum(va)) return 1;
      if (!isNum(vb)) return -1;
      return vb - va;
    });
  }

  function median(nums) {
    const a = nums.filter(isNum).sort((x, y) => x - y);
    if (!a.length) return null;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  const api = { METRICS, DEFAULT_ER_BASE, isNum, sum, engagement, erBaseFor, postER, aggregateER, pctChange, addDays, daysBetween, previousPeriod, inPeriod, followersAt, followerGrowth, totals, findParam, emvForPost, emv, deliveryProgress, investment, businessIndicators, byFormat, rank, median };
  root.Calc = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
