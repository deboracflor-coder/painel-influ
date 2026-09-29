/* Insights automáticos e alertas.
   Só afirmações verificáveis a partir dos dados: cada item traz os números que o sustentam.
   Nenhuma recomendação subjetiva é gerada. */
(function (root) {
  const Calc = root.Calc || require('./calc.js');
  const Query = root.Query || require('./query.js');

  const DEFAULT_ALERTS = {
    reachDropPct: 20,       // queda de alcance/visualizações vs. período anterior (%)
    followerDrop: 0,        // ganho líquido abaixo disso dispara alerta
    campaignEndingDays: 7,  // campanha termina em até N dias com entrega incompleta
    missingMetricsHours: 48,// post publicado há mais de N horas sem métricas
    relevantChangePct: 20,  // variação considerada "relevante" nos insights
    outlierFactor: 2,       // conteúdo acima da média = taxa ≥ N × mediana da plataforma
  };

  const fmtPct = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1).replace('.', ',') + '%';
  const fmtAbs = (v) => Math.abs(v).toFixed(1).replace('.', ',') + '%';
  const fmtInt = (v) => Math.round(v).toLocaleString('pt-BR');
  const PLAT = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', facebook: 'Facebook', linkedin: 'LinkedIn' };
  const FORMAT = { reels: 'Reels', story: 'Stories', carousel: 'Carrossel', photo: 'Foto', video: 'Vídeo', short: 'Shorts', long_video: 'Vídeo longo', live: 'Live', text: 'Texto', other: 'Outro' };

  function insights(db, f, cfg) {
    const out = [];
    const th = { ...DEFAULT_ALERTS, ...(cfg.alerts || {}) };
    const cur = Query.filterPosts(db.posts, f, db);
    const prevP = Calc.previousPeriod(f.start, f.end);
    const prev = Query.filterPosts(db.posts, { ...f, ...prevP }, db);
    if (!cur.length) return [{ kind: 'vazio', tone: 'neutral', text: 'Nenhum conteúdo publicado no período e filtros selecionados, então não há insights para gerar.' }];

    // 1. Vídeo: participação em publicações x visualizações
    const vids = cur.filter((p) => Query.contentKind(p.format) === 'video');
    const totViews = Calc.sum(cur, (p) => p.metrics.views);
    const vidViews = Calc.sum(vids, (p) => p.metrics.views);
    if (vids.length && Calc.isNum(totViews) && totViews > 0 && Calc.isNum(vidViews)) {
      out.push({ kind: 'formato', tone: 'neutral', text: `Os conteúdos em vídeo representaram ${Math.round(vids.length / cur.length * 100)}% das publicações e concentraram ${Math.round(vidViews / totViews * 100)}% das visualizações no período.` });
    }

    // 2. Variação relevante por plataforma (visualizações)
    const plats = [...new Set(cur.map((p) => p.platform))];
    for (const pl of plats) {
      const a = Calc.sum(cur.filter((p) => p.platform === pl), (p) => p.metrics.views);
      const b = Calc.sum(prev.filter((p) => p.platform === pl), (p) => p.metrics.views);
      const ch = Calc.pctChange(a, b);
      if (ch !== null && Math.abs(ch) >= th.relevantChangePct) {
        out.push({ kind: ch > 0 ? 'crescimento' : 'queda', tone: ch > 0 ? 'good' : 'bad', text: `${PLAT[pl]}: visualizações ${ch > 0 ? 'cresceram' : 'caíram'} ${fmtAbs(ch)} em relação ao período anterior (${fmtInt(b)} → ${fmtInt(a)}).` });
      }
    }

    // 3. Seguidores por plataforma
    for (const acc of db.accounts) {
      if (f.platforms && f.platforms.length && !f.platforms.includes(acc.platform)) continue;
      const g = Calc.followerGrowth(db.daily, [acc.id], f.start, f.end);
      if (g.gained !== null && g.pct !== null) {
        out.push({ kind: g.gained >= 0 ? 'crescimento' : 'queda', tone: g.gained >= 0 ? 'good' : 'bad', text: `${PLAT[acc.platform]}: ${g.gained >= 0 ? 'ganho líquido' : 'perda líquida'} de ${fmtInt(Math.abs(g.gained))} seguidores no período (${fmtPct(g.pct)}).` });
      }
    }

    // 4. Conteúdos acima/abaixo da média do mesmo formato na mesma plataforma (taxa de engajamento)
    const groups = {};
    for (const p of cur) (groups[p.platform + '|' + p.format] = groups[p.platform + '|' + p.format] || []).push(p);
    for (const [key, ps] of Object.entries(groups)) {
      const [pl, fmt] = key.split('|');
      const med = Calc.median(ps.map((p) => Calc.postER(p, cfg)));
      if (!Calc.isNum(med) || ps.length < 4) continue;
      const medTxt = med.toFixed(1).replace('.', ',') + '%';
      const above = ps.filter((p) => { const e = Calc.postER(p, cfg); return Calc.isNum(e) && e >= med * th.outlierFactor; });
      const below = ps.filter((p) => { const e = Calc.postER(p, cfg); return Calc.isNum(e) && e <= med / th.outlierFactor; });
      if (above.length) out.push({ kind: 'acima', tone: 'good', postIds: above.map((p) => p.id), text: `${PLAT[pl]} · ${FORMAT[fmt]}: ${above.length} conteúdo(s) com taxa de engajamento de pelo menos ${th.outlierFactor}× a mediana do formato (${medTxt}). Destaque: "${Calc.rank(above, 'er', cfg)[0].title}".` });
      if (below.length) out.push({ kind: 'abaixo', tone: 'bad', postIds: below.map((p) => p.id), text: `${PLAT[pl]} · ${FORMAT[fmt]}: ${below.length} conteúdo(s) com taxa de engajamento de no máximo metade da mediana do formato (${medTxt}).` });
    }

    // 5. Formatos
    const fm = Calc.byFormat(cur, cfg).filter((x) => x.posts >= 2);
    const bestViews = fm.filter((x) => Calc.isNum(x.avgViews)).sort((a, b) => b.avgViews - a.avgViews)[0];
    const bestER = fm.filter((x) => Calc.isNum(x.er)).sort((a, b) => b.er - a.er)[0];
    if (bestViews) out.push({ kind: 'formato', tone: 'neutral', text: `Maior média de visualizações por conteúdo: ${FORMAT[bestViews.format]} (${fmtInt(bestViews.avgViews)} por publicação, ${bestViews.posts} publicações).` });
    if (bestER) out.push({ kind: 'formato', tone: 'neutral', text: `Maior taxa de engajamento agregada: ${FORMAT[bestER.format]} (${bestER.er.toFixed(1).replace('.', ',')}%).` });

    // 6. Campanha com maior alcance/visualizações no período
    const byCamp = {};
    for (const p of cur) if (p.campaign_id) (byCamp[p.campaign_id] = byCamp[p.campaign_id] || []).push(p);
    const camps = Object.entries(byCamp).map(([id, ps]) => ({ id, views: Calc.sum(ps, (p) => p.metrics.views), n: ps.length })).filter((c) => Calc.isNum(c.views)).sort((a, b) => b.views - a.views);
    if (camps.length) {
      const c = db.campaigns.find((x) => x.id === camps[0].id);
      out.push({ kind: 'campanha', tone: 'neutral', text: `Campanha com maior volume de visualizações no período: ${c ? c.name : camps[0].id} (${fmtInt(camps[0].views)} em ${camps[0].n} conteúdos).` });
    }

    // 7. Evolução das marcas (visualizações vs. período anterior)
    for (const b of db.brands) {
      const a = Calc.sum(cur.filter((p) => p.brand_id === b.id), (p) => p.metrics.views);
      const z = Calc.sum(prev.filter((p) => p.brand_id === b.id), (p) => p.metrics.views);
      if (Calc.isNum(a) && Calc.isNum(z)) {
        const ch = Calc.pctChange(a, z);
        out.push({ kind: 'marca', tone: 'neutral', text: `${b.name}: ${fmtInt(a)} visualizações em conteúdos da marca no período, contra ${fmtInt(z)} no período anterior (${fmtPct(ch)}).` });
      } else if (Calc.isNum(a)) {
        out.push({ kind: 'marca', tone: 'neutral', text: `${b.name}: ${fmtInt(a)} visualizações em conteúdos da marca no período. Sem conteúdos da marca no período anterior para comparar.` });
      }
    }

    // 8. Anomalias: pico diário de visualizações da conta (z-score > 3)
    for (const acc of db.accounts) {
      const rows = db.daily.filter((r) => r.account_id === acc.id && r.day >= f.start && r.day <= f.end && Calc.isNum(r.views));
      if (rows.length < 10) continue;
      const vals = rows.map((r) => r.views), mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
      const spikes = rows.filter((r) => sd > 0 && (r.views - mean) / sd > 3);
      for (const s of spikes) out.push({ kind: 'anomalia', tone: 'warn', text: `${PLAT[acc.platform]}: pico atípico de visualizações em ${s.day.split('-').reverse().join('/')} (${fmtInt(s.views)}, mais de 3 desvios-padrão acima da média diária do período). Verifique se há conteúdo viral ou erro de coleta.` });
    }
    return out;
  }

  function alerts(db, f, cfg, now) {
    const th = { ...DEFAULT_ALERTS, ...(cfg.alerts || {}) };
    const today = now.slice(0, 10);
    const out = [];
    const cur = Query.filterPosts(db.posts, { start: f.start, end: f.end }, db);
    const prev = Query.filterPosts(db.posts, Calc.previousPeriod(f.start, f.end), db);

    // Conexões e sincronização
    for (const acc of db.accounts) {
      if (acc.status === 'expired' || acc.status === 'error') out.push({ kind: 'api', severity: 'critical', text: `${PLAT[acc.platform]} desconectado: ${acc.status === 'expired' ? 'o token de acesso expirou, reconecte a conta' : 'a última sincronização falhou'}.` });
      const last = (db.syncRuns || []).filter((r) => r.account_id === acc.id).sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
      if (last && last.status === 'error' && acc.status !== 'expired') out.push({ kind: 'sync', severity: 'critical', text: `Erro na última sincronização de ${PLAT[acc.platform]}: ${last.error}.` });
    }
    // Queda de alcance / visualizações
    for (const pl of [...new Set(db.accounts.map((a) => a.platform))]) {
      for (const m of ['reach', 'views']) {
        const a = Calc.sum(cur.filter((p) => p.platform === pl), (p) => p.metrics[m]);
        const b = Calc.sum(prev.filter((p) => p.platform === pl), (p) => p.metrics[m]);
        const ch = Calc.pctChange(a, b);
        if (ch !== null && ch <= -th.reachDropPct) out.push({ kind: 'queda', severity: 'warning', text: `${PLAT[pl]}: ${m === 'reach' ? 'alcance caiu' : 'visualizações caíram'} ${fmtAbs(ch)} vs. período anterior (limite configurado: −${th.reachDropPct}%).` });
      }
      const accs = db.accounts.filter((a) => a.platform === pl).map((a) => a.id);
      const g = Calc.followerGrowth(db.daily, accs, f.start, f.end);
      if (g.gained !== null && g.gained < th.followerDrop) out.push({ kind: 'seguidores', severity: 'warning', text: `${PLAT[pl]}: perda líquida de ${fmtInt(-g.gained)} seguidores no período.` });
    }
    // Campanhas e entregas
    for (const c of db.campaigns) {
      const dels = db.deliverables.filter((d) => d.campaign_id === c.id);
      const prog = Calc.deliveryProgress(dels, db.posts);
      const daysLeft = Calc.daysBetween(today, c.end_date) - 1;
      if (daysLeft >= 0 && daysLeft <= th.campaignEndingDays && !prog.allComplete) out.push({ kind: 'campanha', severity: 'warning', brandId: c.brand_id, text: `${c.name} termina em ${daysLeft} dia(s) com ${Math.round(prog.pct)}% das entregas concluídas.` });
      for (const l of prog.lines) {
        if (l.due_date && l.due_date < today && !l.complete && l.status !== 'cancelado') out.push({ kind: 'atraso', severity: 'critical', brandId: c.brand_id, text: `Entrega atrasada · ${c.name}: ${l.label} (${l.delivered}/${l.expected}), prazo ${l.due_date.split('-').reverse().join('/')}.` });
      }
      if (c.end_date < today && prog.pct !== null && prog.pct < 100) out.push({ kind: 'meta', severity: 'warning', brandId: c.brand_id, text: `Meta de entregas não atingida · ${c.name}: ${Math.round(prog.pct)}% entregue ao fim da campanha.` });
      if (c.goal_views) {
        const v = Calc.sum(db.posts.filter((p) => p.campaign_id === c.id), (p) => p.metrics.views);
        if (c.end_date < today && Calc.isNum(v) && v < c.goal_views) out.push({ kind: 'meta', severity: 'warning', brandId: c.brand_id, text: `Meta de visualizações não atingida · ${c.name}: ${fmtInt(v)} de ${fmtInt(c.goal_views)}.` });
      }
    }
    // Conteúdo sem métricas
    const limit = new Date(new Date(now).getTime() - th.missingMetricsHours * 3600000).toISOString().slice(0, 10);
    const noMetrics = db.posts.filter((p) => p.published_at.slice(0, 10) <= limit && p.published_at.slice(0, 10) >= f.start && !Calc.isNum(p.metrics.views) && !Calc.isNum(p.metrics.reach));
    if (noMetrics.length) out.push({ kind: 'sem_metricas', severity: 'warning', postIds: noMetrics.map((p) => p.id), text: `${noMetrics.length} conteúdo(s) publicados há mais de ${th.missingMetricsHours}h sem métricas de alcance ou visualização.` });
    const order = { critical: 0, warning: 1, info: 2 };
    return out.sort((a, b) => order[a.severity] - order[b.severity]);
  }

  const api = { DEFAULT_ALERTS, insights, alerts, PLAT, FORMAT };
  root.Insights = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
