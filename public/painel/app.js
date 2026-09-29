/* Painel Influ · interface da demonstração.
   Estado em memória; configurações do usuário em localStorage (quando disponível).
   Fluxo de dados: DemoData → Query.scope (permissão) → Query.filterPosts (filtros globais) → Calc/Insights → telas. */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isNum = Calc.isNum;

  // ---------- Formatação ----------
  const fmtInt = (v) => isNum(v) ? Math.round(v).toLocaleString('pt-BR') : '—';
  const fmtDec = (v, d = 1) => isNum(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const fmtPct = (v, d = 1) => isNum(v) ? fmtDec(v, d) + '%' : '—';
  const fmtBRL = (v) => isNum(v) ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : '—';
  const fmtDate = (iso) => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';
  const fmtDateTime = (iso) => {
    const d = new Date(iso);
    const date = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const time = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
    return `${date} às ${time}`;
  };
  const fmtHours = (min) => isNum(min) ? fmtInt(min / 60) + ' h' : '—';

  const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'facebook', 'linkedin'];
  const PLAT = Insights.PLAT;
  const FORMAT = Insights.FORMAT;
  const pColor = (p) => `var(--p-${p})`;
  const STATUS = {
    planejado: ['Planejado', 'neutral'], em_producao: ['Em produção', 'accent'], aguardando_aprovacao: ['Aguardando aprovação', 'warn'],
    publicado: ['Publicado', 'good'], entregue: ['Entregue', 'good'], pendente: ['Pendente', 'bad'], cancelado: ['Cancelado', 'neutral'],
  };
  const statusPill = (s) => `<span class="pill pill-${(STATUS[s] || ['', 'neutral'])[1]}">${esc((STATUS[s] || [s])[0])}</span>`;
  const GLYPH = { reels: '▶', video: '▶', short: '▶', long_video: '▶', live: '●', story: '◔', carousel: '❐', photo: '▣', text: '¶', other: '◇' };

  const TIPS = {
    followers: 'Total de seguidores ou inscritos no fim do período, somando as contas das plataformas selecionadas. É uma métrica da conta: não muda com filtros de marca, campanha ou formato.',
    growth: 'Ganho líquido no período: seguidores no último dia menos seguidores no dia anterior ao início. A variação percentual é sobre a base inicial.',
    reach: 'Contas únicas que viram cada conteúdo, somadas por conteúdo (a mesma pessoa pode ser contada em mais de um). YouTube não fornece alcance pela API.',
    impressions: 'Vezes que o conteúdo foi exibido. A Meta trocou impressões por visualizações em 2025, então aqui só entram plataformas que ainda fornecem, como as impressões de miniatura do YouTube.',
    views: 'Visualizações conforme a definição de cada plataforma.',
    engagement: 'Curtidas + comentários + compartilhamentos + salvamentos, usando os componentes que cada plataforma fornece.',
    er: 'Soma dos engajamentos ÷ soma da base × 100. Base padrão: alcance no Instagram e Facebook, visualizações no TikTok e YouTube. Ajustável em Parâmetros.',
    likes: 'Curtidas (reações no Facebook).', comments: 'Comentários.', shares: 'Compartilhamentos e reposts.',
    saves: 'Salvamentos. Instagram fornece pela API; no TikTok entra como Dado manual; YouTube e Facebook não fornecem.',
    clicks: 'Cliques em links, como o link dos Stories. As APIs não fornecem cliques por publicação no Instagram e no TikTok, então este número é Dado manual ou vem de links rastreáveis.',
    posts: 'Quantidade de conteúdos publicados no período com os filtros aplicados.',
    avgViews: 'Visualizações ÷ número de conteúdos que têm visualização disponível.',
    avgEng: 'Engajamentos ÷ conteúdos publicados.',
    emv: 'Estimativa do modelo, não é dado da plataforma. Para cada conteúdo: métrica base ÷ 1.000 × CPM de referência cadastrado em Parâmetros. Sem parâmetro cadastrado, o valor fica em branco.',
    roi: 'Estimativa: (valor equivalente estimado − investimento) ÷ investimento. Só aparece quando há investimento cadastrado e valor estimado.',
    cpmReal: 'Custo real por mil visualizações: investimento ÷ visualizações × 1.000. Usa o investimento (Dado manual) e visualizações da plataforma.',
    watch: 'Tempo total assistido (YouTube Analytics).', retention: 'Porcentagem média do vídeo assistida.', ctr: 'Taxa de cliques das impressões de miniatura (só vídeos longos).',
  };
  const tip = (key, text) => `<span class="tip" tabindex="0" data-tip="${esc(text || TIPS[key] || key)}" aria-label="${esc(text || TIPS[key] || key)}">?</span>`;

  // ---------- Estado ----------
  const CFG_KEY = 'painel-influ-cfg-v1';
  const loadCfg = () => { try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch (e) { return {}; } };
  // Modo produção: o servidor (Next.js) injeta os dados já recortados pela permissão do usuário
  const INJ = window.__PAINEL__ || null;
  const LIVE = !!(INJ && INJ.mode === 'live');
  let saveTimer = null;
  const saveCfg = () => {
    const payload = { erBase: state.cfg.erBase, alerts: state.cfg.alerts, params: state.db.params };
    if (LIVE) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => api('PATCH', '/api/settings', payload).then(() => toast('Parâmetros salvos.')).catch((e) => toast('Não foi possível salvar: ' + e.message)), 700);
      return;
    }
    try { localStorage.setItem(CFG_KEY, JSON.stringify(payload)); } catch (e) { /* armazenamento indisponível: segue só em memória */ }
  };
  async function api(method, url, body) {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || 'erro ' + res.status);
    return out;
  }

  const db = LIVE ? INJ.data : DemoData.build();
  const saved = LIVE ? (INJ.settings || {}) : loadCfg();
  if (Array.isArray(saved.params)) db.params = saved.params;
  const state = {
    db,
    viewer: LIVE ? INJ.viewer : { role: 'owner', brandId: null },
    filters: { preset: 'mes_atual', start: db.meta.today.slice(0, 8) + '01', end: db.meta.today, platforms: [], brand: '', campaign: '', format: '', contentKind: '', contentType: '', deliveryStatus: '' },
    compare: true,
    cfg: { erBase: { ...Calc.DEFAULT_ER_BASE, ...(saved.erBase || {}) }, alerts: { ...Insights.DEFAULT_ALERTS, ...(saved.alerts || {}) } },
    route: 'visao', sub: null,
    simulateFail: {},
    sort: 'views', contentLimit: 24,
    importDraft: null,
    compareA: 'cp_aur_ago', compareB: 'cp_tri_10k',
    editorial: '',
    syncing: false,
    audit: [],
  };

  const PRESETS = {
    ultimos_7: ['Últimos 7 dias', () => [Calc.addDays(db.meta.today, -6), db.meta.today]],
    ultimos_30: ['Últimos 30 dias', () => [Calc.addDays(db.meta.today, -29), db.meta.today]],
    mes_atual: ['Mês atual', () => [db.meta.today.slice(0, 8) + '01', db.meta.today]],
    mes_anterior: ['Mês anterior', () => { const first = db.meta.today.slice(0, 8) + '01'; const end = Calc.addDays(first, -1); return [end.slice(0, 8) + '01', end]; }],
    ultimos_90: ['Últimos 90 dias', () => [Calc.addDays(db.meta.today, -89), db.meta.today]],
    custom: ['Personalizado', null],
  };

  const scoped = () => Query.scope(state.db, state.viewer);
  const isBrand = () => state.viewer.role === 'brand';
  const canEdit = () => Query.can(state.viewer, 'edit');
  const effFilters = () => ({ ...state.filters, brand: isBrand() ? state.viewer.brandId : state.filters.brand });
  const postsNow = (d = scoped()) => Query.filterPosts(d.posts, effFilters(), d);
  const postsPrev = (d = scoped()) => Query.filterPosts(d.posts, { ...effFilters(), ...Calc.previousPeriod(state.filters.start, state.filters.end) }, d);
  const activeAccounts = (d = scoped()) => d.accounts.filter((a) => a.status !== 'not_configured' && (!state.filters.platforms.length || state.filters.platforms.includes(a.platform)));
  const hasManual = (posts, metric) => posts.some((p) => (p.manualFields || []).includes(metric));
  const campaignName = (id) => (state.db.campaigns.find((c) => c.id === id) || {}).name || '—';
  const brandName = (id) => (state.db.brands.find((b) => b.id === id) || {}).name || '—';
  const brandIdx = (id) => state.db.brands.findIndex((b) => b.id === id);
  const BRAND_COLORS = ['#7a3fb0', '#1f6f5c', '#a4532a'];

  // ---------- Componentes ----------
  function delta(cur, prev, invert = false) {
    if (!state.compare) return '';
    const ch = Calc.pctChange(cur, prev);
    if (ch === null) return `<span class="delta flat" title="Sem base de comparação no período anterior">sem base</span>`;
    const up = ch > 0.05, down = ch < -0.05;
    const cls = up ? (invert ? 'down' : 'up') : down ? (invert ? 'up' : 'down') : 'flat';
    return `<span class="delta ${cls}">${up ? '↑' : down ? '↓' : '→'} ${fmtDec(Math.abs(ch))}%</span>`;
  }
  function kpi({ label, value, prev, fmt = fmtInt, tipKey, tipText, badges = '', na = null, extra = '' }) {
    if (na) return `<div class="kpi unavailable"><div class="kpi-label">${esc(label)} ${tip(tipKey, tipText)}</div><div class="kpi-value na">${esc(na)}</div><div class="kpi-foot">${badges}</div></div>`;
    const prevTxt = state.compare && isNum(prev) ? `<span>antes: ${fmt(prev)}</span>` : '';
    return `<div class="kpi"><div class="kpi-label">${esc(label)} ${tip(tipKey, tipText)}</div><div class="kpi-value">${isNum(value) ? fmt(value) : '<span class="muted">Sem dado</span>'}</div><div class="kpi-foot">${isNum(value) ? delta(value, prev) : ''} ${prevTxt} ${badges} ${extra}</div></div>`;
  }
  const manualBadge = (on = true) => on ? '<span class="badge badge-manual" title="Inclui valores inseridos manualmente">Dado manual</span>' : '';
  const estBadge = '<span class="badge badge-estimate" title="Calculado pelo dashboard a partir de parâmetros cadastrados; não é dado da plataforma">Estimativa</span>';
  const calcBadge = '<span class="badge badge-calc" title="Calculado a partir de dados da plataforma e dados manuais">Calculado</span>';
  const apiBadge = '<span class="badge badge-api">API</span>';

  function thumb(p, rank) {
    const h = p.hue ?? 250;
    const bg = `linear-gradient(135deg, hsl(${h} 55% 42%), hsl(${(h + 40) % 360} 60% 30%))`;
    return `<div class="thumb" style="background:${bg}" aria-hidden="true"><span class="thumb-glyph">${GLYPH[p.format] || '◇'}</span>${rank ? `<span class="thumb-rank">${rank}º</span>` : ''}<span class="thumb-tag">${PLAT[p.platform]} · ${FORMAT[p.format]}</span></div>`;
  }

  function contentCard(p, rank, hlKey) {
    const m = p.metrics, er = Calc.postER(p, state.cfg), eng = Calc.engagement(m);
    const cell = (k, label, val, fmt = fmtInt) => `<div><span>${label}${(p.manualFields || []).includes(k) ? ' ✎' : ''}</span><b class="${hlKey === k ? 'hl' : ''}">${fmt(val)}</b></div>`;
    const noMetrics = !isNum(m.views) && !isNum(m.reach);
    return `<article class="content-card">${thumb(p, rank)}<div class="content-body">
      <div class="content-meta"><span>${fmtDate(p.published_at)}</span>${p.sponsored ? '<span class="badge badge-sponsored">Patrocinado</span>' : '<span class="badge badge-api">Orgânico</span>'}${(p.manualFields || []).length ? manualBadge() : ''}${p.source === 'import' ? '<span class="badge badge-manual">Importado</span>' : ''}</div>
      <div class="content-title">${esc(p.title)}</div>
      ${p.campaign_id ? `<div class="content-meta"><span>${esc(campaignName(p.campaign_id))}</span>${p.brand_id ? `<span>· ${esc(brandName(p.brand_id))}</span>` : ''}</div>` : ''}
      ${noMetrics ? `<div class="callout callout-warn"><p>Sem métricas: a sincronização desta conta está com erro.</p></div>` : ''}
      <div class="metric-list">
        ${cell('reach', 'Alcance', m.reach)}${cell('views', 'Views', m.views)}${cell('likes', 'Curtidas', m.likes)}
        ${cell('comments', 'Coment.', m.comments)}${cell('shares', 'Compart.', m.shares)}${cell('saves', 'Salvos', m.saves)}
        ${cell('engagement', 'Engaj.', eng)}${cell('er', 'Taxa', er, (v) => fmtPct(v))}${cell('follows', 'Seguid.', m.follows)}
      </div>
      ${p.url ? `<a class="small" href="${esc(p.url)}" target="_blank" rel="noopener">Abrir conteúdo ↗</a>` : ''}
    </div></article>`;
  }

  function emptyState(title, text) { return `<div class="panel"><div class="empty"><strong>${esc(title)}</strong><span>${esc(text)}</span></div></div>`; }

  // ---------- Navegação ----------
  const NAV_INTERNAL = [
    ['Acompanhar', [['visao', 'Visão executiva'], ['redes', 'Por rede social'], ['conteudos', 'Conteúdos em destaque'], ['formatos', 'Formatos']]],
    ['Parcerias', [['marcas', 'Marcas parceiras'], ['entregas', 'Controle de entregas'], ['campanhas', 'Campanhas']]],
    ['Inteligência', [['insights', 'Insights e alertas'], ['relatorio', 'Relatório']]],
    ['Dados', [['integracoes', 'Integrações'], ['importar', 'Importação'], ['parametros', 'Parâmetros'], ['metodologia', 'Metodologia']]],
  ];
  function navBrand() { return [['Portal da marca', [['marca.' + state.viewer.brandId, 'Visão da parceria'], ['conteudos', 'Conteúdos'], ['entregas', 'Entregas'], ['campanhas', 'Campanhas'], ['relatorio', 'Relatório']]]]; }
  const ALLOWED_BRAND = ['marca', 'conteudos', 'entregas', 'campanhas', 'relatorio'];

  function renderNav() {
    const groups = isBrand() ? navBrand() : NAV_INTERNAL;
    const alertCount = isBrand() ? 0 : Insights.alerts(scoped(), state.filters, state.cfg, state.db.meta.now).filter((a) => a.severity === 'critical').length;
    const cur = state.route + (state.sub ? '.' + state.sub : '');
    $('#nav').innerHTML = groups.map(([g, items]) => `<div class="nav-group">${g}</div>` + items.map(([r, label]) => {
      const current = cur === r || (state.route === r) || (r === 'marcas' && state.route === 'marca');
      return `<a class="nav-link" href="#${r}" ${current ? 'aria-current="page"' : ''}><span>${label}</span>${r === 'insights' && alertCount ? `<span class="nav-count" title="Alertas críticos">${alertCount}</span>` : ''}</a>`;
    }).join('')).join('');
    $('#viewer-sub').textContent = isBrand() ? 'Portal · ' + brandName(state.viewer.brandId) : Query.ROLES[state.viewer.role].label;
  }

  function renderViewerSelect() {
    const opts = [['owner', 'Equipe · administração'], ['viewer', 'Equipe · somente leitura'], ...state.db.brands.map((b) => ['brand:' + b.id, 'Portal · ' + b.name + (b.demo ? ' (fictícia)' : '')])];
    const cur = isBrand() ? 'brand:' + state.viewer.brandId : state.viewer.role;
    $('#viewer-select').innerHTML = opts.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('');
  }

  function renderTopbar(title) {
    $('#page-title').textContent = title;
    const d = scoped();
    const prev = Calc.previousPeriod(state.filters.start, state.filters.end);
    const syncTxt = isBrand() ? '' : `<span>Última atualização: <b>${state.db.meta.lastSync ? fmtDateTime(state.db.meta.lastSync) : 'ainda não houve'}</b></span>`;
    if (NO_FILTERS.includes(state.route)) { $('#topbar-meta').innerHTML = syncTxt; } else
    $('#topbar-meta').innerHTML = `<span>Período: <b>${fmtDate(state.filters.start)} – ${fmtDate(state.filters.end)}</b></span>${state.compare ? `<span>Comparando com ${fmtDate(prev.start)} – ${fmtDate(prev.end)}</span>` : ''}${syncTxt}`;
    $('#btn-sync').hidden = isBrand();
    $('#btn-sync').disabled = state.syncing;
    $('#btn-sync').textContent = state.syncing ? 'Sincronizando…' : 'Atualizar dados';
    void d;
  }

  const NO_FILTERS = ['marca', 'marcas', 'integracoes', 'importar', 'parametros', 'metodologia'];
  function renderFilters() {
    $('#filters').hidden = NO_FILTERS.includes(state.route);
    const d = scoped(), f = state.filters;
    const nActive = [f.platforms.length, !isBrand() && f.brand, f.campaign, f.format, f.contentKind, f.contentType, f.deliveryStatus].filter(Boolean).length;
    const sel = (id, label, options, value, extra = '') => `<label class="filter" for="${id}"><span>${label}</span><select id="${id}" data-filter="${id.replace('f-', '')}" ${extra}><option value="">Todos</option>${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    const campaigns = d.campaigns.filter((c) => !f.brand || c.brand_id === f.brand);
    const formats = [...new Set(d.posts.map((p) => p.format))];
    $('#filters').innerHTML = `
      <button class="btn btn-sm filters-toggle" data-action="toggle-filters" aria-expanded="${$('#filters').classList.contains('open')}">Filtros${nActive ? ` (${nActive})` : ''}</button>
      <label class="filter" for="f-preset"><span>Período</span><select id="f-preset" data-action="preset">${Object.entries(PRESETS).map(([k, [l]]) => `<option value="${k}" ${k === f.preset ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${f.preset === 'custom' ? `<label class="filter" for="f-start"><span>De</span><input type="date" id="f-start" data-date="start" value="${f.start}" min="${state.db.meta.dataStart}" max="${state.db.meta.today}"></label><label class="filter" for="f-end"><span>Até</span><input type="date" id="f-end" data-date="end" value="${f.end}" min="${state.db.meta.dataStart}" max="${state.db.meta.today}"></label>` : ''}
      <div class="filter"><span>Plataforma</span><div class="chips">${PLATFORMS.filter((p) => p !== 'linkedin' || d.accounts.some((a) => a.platform === p)).map((p) => `<button class="chip" data-action="platform" data-platform="${p}" aria-pressed="${f.platforms.includes(p)}"><i class="dot" style="background:${pColor(p)}"></i>${PLAT[p]}</button>`).join('')}</div></div>
      ${isBrand() ? '' : sel('f-brand', 'Marca', d.brands.map((b) => [b.id, b.name]), f.brand)}
      ${sel('f-campaign', 'Campanha', campaigns.map((c) => [c.id, c.name]), f.campaign)}
      ${sel('f-format', 'Formato', formats.map((x) => [x, FORMAT[x]]), f.format)}
      ${sel('f-contentKind', 'Tipo de conteúdo', [['video', 'Vídeo'], ['estatico', 'Estático'], ['efemero', 'Efêmero (Stories)']], f.contentKind)}
      ${isBrand() ? '' : sel('f-contentType', 'Orgânico / patrocinado', [['organico', 'Orgânico'], ['patrocinado', 'Patrocinado']], f.contentType)}
      ${sel('f-deliveryStatus', 'Status da entrega', Object.entries(STATUS).map(([k, [l]]) => [k, l]), f.deliveryStatus)}
      <label class="compare-toggle" for="f-compare"><input type="checkbox" id="f-compare" data-action="compare" ${state.compare ? 'checked' : ''}> Comparar com período anterior</label>
      ${nActive ? `<button class="btn btn-sm filter-clear" data-action="clear-filters">Limpar filtros</button>` : ''}`;
  }

  // ---------- Telas ----------
  function viewVisao() {
    const d = scoped(), cur = postsNow(d), prev = postsPrev(d);
    const t = Calc.totals(cur, state.cfg), tp = Calc.totals(prev, state.cfg);
    const accIds = activeAccounts(d).map((a) => a.id);
    const g = Calc.followerGrowth(d.daily, accIds, state.filters.start, state.filters.end);
    const pp = Calc.previousPeriod(state.filters.start, state.filters.end);
    const gp = Calc.followerGrowth(d.daily, accIds, pp.start, pp.end);
    const postFilter = state.filters.brand || state.filters.campaign || state.filters.format || state.filters.contentKind || state.filters.contentType || state.filters.deliveryStatus;
    const accNote = postFilter ? '<span class="badge badge-api" title="Seguidores são métricas da conta e não mudam com filtros de conteúdo">Conta</span>' : '';

    const syncStrip = `<div class="sync-strip" aria-label="Status das conexões">${d.accounts.map((a) => {
      const last = (d.syncRuns || []).filter((r) => r.account_id === a.id).sort((x, y) => y.started_at.localeCompare(x.started_at))[0];
      const ok = a.status === 'connected' && (!last || last.status === 'success');
      const off = a.status === 'not_configured';
      return `<a class="sync-chip" href="#integracoes" style="text-decoration:none;color:inherit"><i class="dot" style="background:${pColor(a.platform)}"></i>${PLAT[a.platform]}: <span class="${off ? 'off' : ok ? 'ok' : 'err'}">${off ? '— não configurado' : ok ? '✓ atualizado' : a.status === 'expired' ? '✕ token expirado' : '✕ erro na sincronização'}</span></a>`;
    }).join('')}</div>`;

    // Visualizações por semana de publicação, empilhadas por plataforma
    const weeks = [];
    for (let s = state.filters.start; s <= state.filters.end; s = Calc.addDays(s, 7)) weeks.push(s);
    const plats = PLATFORMS.filter((p) => cur.some((x) => x.platform === p));
    const series = plats.map((p) => ({ name: PLAT[p], color: pColor(p), values: weeks.map((w) => Calc.sum(cur.filter((x) => x.platform === p && x.published_at.slice(0, 10) >= w && x.published_at.slice(0, 10) < Calc.addDays(w, 7)), (x) => x.metrics.views) || 0) }));
    const weekLabel = (w, long) => long ? `Semana de ${fmtDate(w)} a ${fmtDate(Calc.addDays(w, 6) > state.filters.end ? state.filters.end : Calc.addDays(w, 6))}` : w.slice(8, 10) + '/' + w.slice(5, 7);

    // Participação por plataforma
    const share = plats.map((p) => ({ p, views: Calc.sum(cur.filter((x) => x.platform === p), (x) => x.metrics.views) || 0, n: cur.filter((x) => x.platform === p).length }));
    const maxShare = Math.max(1, ...share.map((s) => s.views));
    const top = Calc.rank(cur, 'views', state.cfg).slice(0, 3);
    const ins = Insights.insights(d, effFilters(), state.cfg).slice(0, 4);
    const al = Insights.alerts(d, state.filters, state.cfg, state.db.meta.now);

    if (!cur.length && !accIds.length) return emptyState('Nenhum dado no período', 'Ajuste o período ou os filtros.');
    return `
      ${syncStrip}
      <section class="section"><div class="section-head"><h2>Audiência</h2><p class="section-sub">Valor no período e variação contra o período anterior equivalente</p></div>
        <div class="grid grid-kpi">
          ${kpi({ label: 'Seguidores', value: g.followers, prev: gp.followers, tipKey: 'followers', badges: accNote })}
          ${kpi({ label: 'Crescimento de seguidores', value: g.gained, prev: gp.gained, tipKey: 'growth', fmt: (v) => (v > 0 ? '+' : '') + fmtInt(v), extra: isNum(g.pct) ? `<span>${fmtPct(g.pct)} da base</span>` : '' })}
          ${kpi({ label: 'Alcance', value: t.reach, prev: tp.reach, tipKey: 'reach' })}
          ${kpi({ label: 'Impressões', value: t.impressions, prev: tp.impressions, tipKey: 'impressions', badges: '<span class="badge badge-api" title="Só YouTube (vídeos longos) nesta seleção">Parcial</span>' })}
          ${kpi({ label: 'Visualizações', value: t.views, prev: tp.views, tipKey: 'views' })}
        </div></section>
      <section class="section"><div class="section-head"><h2>Engajamento</h2></div>
        <div class="grid grid-kpi">
          ${kpi({ label: 'Engajamentos', value: t.engagement, prev: tp.engagement, tipKey: 'engagement', badges: manualBadge(hasManual(cur, 'saves')) })}
          ${kpi({ label: 'Taxa de engajamento', value: t.er, prev: tp.er, tipKey: 'er', fmt: (v) => fmtPct(v, 2) })}
          ${kpi({ label: 'Curtidas', value: t.likes, prev: tp.likes, tipKey: 'likes' })}
          ${kpi({ label: 'Comentários', value: t.comments, prev: tp.comments, tipKey: 'comments' })}
          ${kpi({ label: 'Compartilhamentos', value: t.shares, prev: tp.shares, tipKey: 'shares' })}
          ${kpi({ label: 'Salvamentos', value: t.saves, prev: tp.saves, tipKey: 'saves', badges: manualBadge(hasManual(cur, 'saves')) })}
          ${kpi({ label: 'Cliques', value: t.clicks, prev: tp.clicks, tipKey: 'clicks', badges: manualBadge(isNum(t.clicks)) })}
        </div></section>
      <section class="section"><div class="section-head"><h2>Produção</h2></div>
        <div class="grid grid-kpi">
          ${kpi({ label: 'Conteúdos publicados', value: t.posts, prev: tp.posts, tipKey: 'posts' })}
          ${kpi({ label: 'Visualizações médias por conteúdo', value: t.avgViews, prev: tp.avgViews, tipKey: 'avgViews' })}
          ${kpi({ label: 'Engajamento médio por conteúdo', value: t.avgEngagement, prev: tp.avgEngagement, tipKey: 'avgEng' })}
        </div></section>
      <div class="grid grid-2">
        <div class="panel"><h3>Visualizações por semana de publicação</h3>
          <div class="legend">${series.map((s) => `<span><i class="dot" style="background:${s.color}"></i>${s.name}</span>`).join('')}</div>
          ${Charts.stacked({ labels: weeks, series, labelFmt: weekLabel })}
          <p class="small muted">Views acumuladas até hoje dos conteúdos publicados em cada semana.</p></div>
        <div class="panel"><h3>Participação por plataforma</h3>
          ${share.map((s) => `<div class="hbar-row"><span><i class="dot" style="background:${pColor(s.p)}"></i> ${PLAT[s.p]}</span><div class="hbar-track"><div class="hbar-fill" style="width:${(s.views / maxShare * 100).toFixed(1)}%;background:${pColor(s.p)}"></div></div><span class="num small"><b>${fmtInt(s.views)}</b> views · ${s.n} conteúdos</span></div>`).join('') || '<p class="muted">Sem conteúdos no período.</p>'}
        </div>
      </div>
      <div class="panel"><div class="section-head"><h3>Top 3 por visualizações</h3><a class="small" href="#conteudos">Ver ranking completo</a></div>
        <div class="content-grid">${top.map((p, i) => contentCard(p, i + 1, 'views')).join('') || '<p class="muted">Sem conteúdos.</p>'}</div></div>
      <div class="grid grid-2">
        <div class="panel"><div class="section-head"><h3>O que os dados mostram</h3><a class="small" href="#insights">Todos os insights</a></div>
          ${ins.map((i) => `<div class="insight"><span class="insight-mark ${i.tone}"></span><span>${esc(i.text)}</span></div>`).join('')}
          <p class="small muted">Gerado automaticamente a partir dos dados disponíveis no período. Não inclui interpretação subjetiva.</p></div>
        <div class="panel"><div class="section-head"><h3>Precisa de ação (${al.length})</h3><a class="small" href="#insights">Ver alertas</a></div>
          ${al.slice(0, 5).map((a) => `<div class="insight"><span class="pill pill-${a.severity === 'critical' ? 'bad' : 'warn'}">${a.severity === 'critical' ? 'Crítico' : 'Atenção'}</span><span>${esc(a.text)}</span></div>`).join('') || '<div class="empty"><strong>Nenhum alerta</strong></div>'}</div>
      </div>`;
  }

  const PLATFORM_KPIS = {
    instagram: ['followers', 'newFollowers', 'reach', 'impressions', 'views', 'likes', 'comments', 'shares', 'saves', 'clicks', 'engagement', 'er', 'posts'],
    tiktok: ['followers', 'newFollowers', 'views', 'avgViews', 'reach', 'likes', 'comments', 'shares', 'saves', 'er', 'retention', 'posts'],
    youtube: ['followers', 'newFollowers', 'views', 'watch', 'retention', 'likes', 'comments', 'shares', 'impressions', 'ctr', 'posts'],
    facebook: ['followers', 'newFollowers', 'reach', 'views', 'likes', 'comments', 'shares', 'engagement', 'er', 'posts'],
    linkedin: [],
  };
  const NA = {
    instagram: { impressions: 'A Meta substituiu impressões por visualizações em 2025' },
    tiktok: {},
    youtube: {},
    facebook: {},
  };

  function viewRedes() {
    const d = scoped();
    const plat = state.sub && PLATFORMS.includes(state.sub) ? state.sub : 'instagram';
    const acc = d.accounts.find((a) => a.platform === plat);
    const tabs = `<div class="tabs" role="tablist">${PLATFORMS.map((p) => `<a class="tab" role="tab" href="#redes.${p}" aria-selected="${p === plat}" style="text-decoration:none"><i class="dot" style="background:${pColor(p)}"></i>${PLAT[p]}</a>`).join('')}</div>`;
    if (!acc || acc.status === 'not_configured') {
      return tabs + `<div class="panel"><div class="empty"><strong>${PLAT[plat]} não está conectado</strong><span>O LinkedIn só libera métricas pela API para Páginas de empresa, com aprovação da Community Management API. Para perfil pessoal, importe o CSV exportado do LinkedIn em Importação (entra como Dado manual).</span><a class="btn btn-sm" href="#integracoes">Ver integrações</a></div></div>`;
    }
    const fl = { ...effFilters(), platforms: [plat] };
    const cur = Query.filterPosts(d.posts, fl, d), prev = Query.filterPosts(d.posts, { ...fl, ...Calc.previousPeriod(fl.start, fl.end) }, d);
    const t = Calc.totals(cur, state.cfg), tp = Calc.totals(prev, state.cfg);
    const g = Calc.followerGrowth(d.daily, [acc.id], fl.start, fl.end);
    const pp = Calc.previousPeriod(fl.start, fl.end);
    const gp = Calc.followerGrowth(d.daily, [acc.id], pp.start, pp.end);
    const avg = (arr, k) => { const v = arr.map((p) => p.metrics[k]).filter(isNum); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const fLabel = plat === 'youtube' ? 'Inscritos' : 'Seguidores';
    const defs = {
      followers: () => kpi({ label: fLabel, value: g.followers, prev: gp.followers, tipKey: 'followers' }),
      newFollowers: () => kpi({ label: plat === 'youtube' ? 'Novos inscritos (líquido)' : 'Novos seguidores (líquido)', value: g.gained, prev: gp.gained, tipKey: 'growth', fmt: (v) => (v > 0 ? '+' : '') + fmtInt(v), extra: isNum(g.pct) ? `<span>${fmtPct(g.pct)}</span>` : '' }),
      reach: () => kpi({ label: 'Alcance', value: t.reach, prev: tp.reach, tipKey: 'reach' }),
      impressions: () => NA[plat] && NA[plat].impressions ? kpi({ label: 'Impressões', tipKey: 'impressions', na: 'Indisponível na API', badges: `<span class="small">${NA[plat].impressions}</span>` }) : kpi({ label: plat === 'youtube' ? 'Impressões (miniatura)' : 'Impressões', value: t.impressions, prev: tp.impressions, tipKey: 'impressions' }),
      views: () => kpi({ label: 'Visualizações', value: t.views, prev: tp.views, tipKey: 'views' }),
      avgViews: () => kpi({ label: 'Visualizações médias', value: t.avgViews, prev: tp.avgViews, tipKey: 'avgViews' }),
      likes: () => kpi({ label: plat === 'facebook' ? 'Reações' : 'Curtidas', value: t.likes, prev: tp.likes, tipKey: 'likes' }),
      comments: () => kpi({ label: 'Comentários', value: t.comments, prev: tp.comments, tipKey: 'comments' }),
      shares: () => kpi({ label: 'Compartilhamentos', value: t.shares, prev: tp.shares, tipKey: 'shares' }),
      saves: () => kpi({ label: 'Salvamentos', value: t.saves, prev: tp.saves, tipKey: 'saves', badges: manualBadge(hasManual(cur, 'saves')) }),
      clicks: () => isNum(t.clicks) ? kpi({ label: 'Cliques em links', value: t.clicks, prev: tp.clicks, tipKey: 'clicks', badges: manualBadge() }) : kpi({ label: 'Cliques em links', tipKey: 'clicks', na: 'Sem dado manual no período', badges: manualBadge() }),
      engagement: () => kpi({ label: 'Engajamento', value: t.engagement, prev: tp.engagement, tipKey: 'engagement' }),
      er: () => kpi({ label: 'Taxa de engajamento', value: t.er, prev: tp.er, tipKey: 'er', fmt: (v) => fmtPct(v, 2), extra: `<span>base: ${Calc.erBaseFor(plat, state.cfg) === 'reach' ? 'alcance' : Calc.erBaseFor(plat, state.cfg) === 'views' ? 'visualizações' : 'impressões'}</span>` }),
      posts: () => kpi({ label: 'Conteúdos publicados', value: t.posts, prev: tp.posts, tipKey: 'posts' }),
      watch: () => kpi({ label: 'Watch time', value: t.watch_time_min, prev: tp.watch_time_min, tipKey: 'watch', fmt: fmtHours }),
      retention: () => kpi({ label: 'Retenção média', value: avg(cur, 'avg_view_pct'), prev: avg(prev, 'avg_view_pct'), tipKey: 'retention', fmt: (v) => fmtPct(v) }),
      ctr: () => { const lv = cur.filter((p) => isNum(p.metrics.impressions)); const lp = prev.filter((p) => isNum(p.metrics.impressions)); const c = (a) => { const i = Calc.sum(a, (p) => p.metrics.impressions), v = Calc.sum(a, (p) => p.metrics.views); return isNum(i) && i > 0 ? v / i * 100 : null; }; return kpi({ label: 'CTR da miniatura', value: c(lv), prev: c(lp), tipKey: 'ctr', fmt: (v) => fmtPct(v) }); },
    };
    const rows = d.daily.filter((r) => r.account_id === acc.id && r.day >= fl.start && r.day <= fl.end);
    const broken = acc.status !== 'connected';
    return `${tabs}
      ${broken ? `<div class="callout callout-bad"><p><b>${PLAT[plat]} está desconectado desde ${fmtDate(acc.last_synced_at)}.</b> Os números abaixo param nessa data e os conteúdos publicados depois aparecem sem métricas. Reconecte em <a href="#integracoes">Integrações</a>.</p></div>` : ''}
      <div class="panel" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><i class="dot" style="background:${pColor(plat)};width:14px;height:14px"></i><b>${esc(acc.handle)}</b><span class="muted">${esc(acc.name)}</span>${apiBadge}<span class="muted small">Última coleta: ${acc.last_synced_at ? fmtDateTime(acc.last_synced_at) : '—'}</span></div>
      <div class="grid grid-kpi">${PLATFORM_KPIS[plat].map((k) => defs[k]()).join('')}</div>
      <div class="grid grid-2">
        <div class="panel"><h3>${fLabel} por dia</h3>${Charts.line({ series: [{ name: fLabel, color: pColor(plat), values: rows.map((r) => r.followers) }], labels: rows.map((r) => r.day), fmt: Charts.compact })}</div>
        <div class="panel"><h3>Visualizações diárias da conta</h3>${Charts.line({ series: [{ name: 'Visualizações', color: pColor(plat), values: rows.map((r) => r.views) }], labels: rows.map((r) => r.day), minZero: true })}</div>
      </div>
      <div class="panel"><div class="section-head"><h3>Melhores conteúdos de ${PLAT[plat]} no período</h3><a class="small" href="#conteudos">Ranking completo</a></div>
        <div class="content-grid">${Calc.rank(cur, 'views', state.cfg).slice(0, 4).map((p, i) => contentCard(p, i + 1, 'views')).join('') || '<p class="muted">Sem conteúdos no período.</p>'}</div></div>`;
  }

  const SORTS = [['reach', 'Maior alcance'], ['views', 'Mais visualizações'], ['engagement', 'Mais engajamento'], ['er', 'Maior taxa de engajamento'], ['shares', 'Mais compartilhamentos'], ['saves', 'Mais salvamentos'], ['comments', 'Mais comentários'], ['follows', 'Maior crescimento (seguidores ganhos)']];
  function viewConteudos() {
    const d = scoped(), cur = postsNow(d);
    const ranked = Calc.rank(cur, state.sort, state.cfg);
    const shown = ranked.slice(0, state.contentLimit);
    const withVal = ranked.filter((p) => { const v = state.sort === 'engagement' ? Calc.engagement(p.metrics) : state.sort === 'er' ? Calc.postER(p, state.cfg) : p.metrics[state.sort]; return isNum(v); }).length;
    return `<div class="section-head"><p class="section-sub">${cur.length} conteúdos no período com os filtros aplicados. ${withVal < cur.length ? `${cur.length - withVal} não têm "${SORTS.find((s) => s[0] === state.sort)[1].toLowerCase()}" disponível e ficam no fim da lista.` : ''}</p>
      <label class="filter" for="sort-select"><span>Ordenar por</span><select id="sort-select" data-action="sort">${SORTS.map(([k, l]) => `<option value="${k}" ${k === state.sort ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      ${cur.length ? `<div class="content-grid">${shown.map((p, i) => contentCard(p, i + 1, state.sort)).join('')}</div>` : emptyState('Nenhum conteúdo encontrado', 'Nenhuma publicação corresponde ao período e aos filtros selecionados.')}
      ${ranked.length > shown.length ? `<button class="btn" data-action="more" style="align-self:center">Mostrar mais (${ranked.length - shown.length} restantes)</button>` : ''}
      <p class="small muted">✎ ao lado da métrica = Dado manual. "Seguid." = seguidores ganhos pelo conteúdo, quando a plataforma fornece (Instagram e YouTube).</p>`;
  }

  function viewFormatos() {
    const d = scoped(), cur = postsNow(d);
    if (!cur.length) return emptyState('Nenhum conteúdo no período', 'Sem publicações para comparar formatos.');
    const groups = {};
    for (const p of cur) { const k = p.platform + '|' + p.format; (groups[k] = groups[k] || []).push(p); }
    const rows = Object.entries(groups).map(([k, ps]) => {
      const [pl, fm] = k.split('|'); const t = Calc.totals(ps, state.cfg);
      const followsPer = isNum(t.follows) ? t.follows / ps.length : null;
      const avgReach = isNum(t.reach) ? t.reach / ps.filter((p) => isNum(p.metrics.reach)).length : null;
      return { pl, fm, label: pl === 'tiktok' ? 'TikTok' : `${FORMAT[fm]} · ${PLAT[pl]}`, t, followsPer, avgReach, potential: isNum(t.avgViews) && isNum(t.er) ? t.avgViews * t.er / 100 : null };
    }).sort((a, b) => (b.t.views || 0) - (a.t.views || 0));
    const best = (key, fn) => { const r = rows.filter((x) => isNum(fn(x)) && x.t.posts >= 2).sort((a, b) => fn(b) - fn(a))[0]; return r ? r.label : '—'; };
    const maxAvg = Math.max(1, ...rows.map((r) => r.t.avgViews || 0));
    return `
      <div class="grid grid-kpi">
        <div class="kpi"><div class="kpi-label">Maior alcance médio ${tip('', 'Alcance ÷ publicações com alcance disponível. Formatos com pelo menos 2 publicações.')}</div><div class="kpi-value" style="font-size:18px">${esc(best('reach', (x) => x.avgReach))}</div></div>
        <div class="kpi"><div class="kpi-label">Maior taxa de engajamento ${tip('er')}</div><div class="kpi-value" style="font-size:18px">${esc(best('er', (x) => x.t.er))}</div></div>
        <div class="kpi"><div class="kpi-label">Maior crescimento ${tip('', 'Seguidores ganhos por publicação (métrica "follows"), disponível para Instagram e YouTube.')}</div><div class="kpi-value" style="font-size:18px">${esc(best('follows', (x) => x.followsPer))}</div></div>
        <div class="kpi"><div class="kpi-label">Maior potencial para marcas ${tip('', 'Índice = visualizações médias × taxa de engajamento. Combina volume e atenção; é uma regra fixa e documentada, não uma opinião.')}</div><div class="kpi-value" style="font-size:18px">${esc(best('pot', (x) => x.potential))}</div><div class="kpi-foot">${calcBadge}</div></div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Formato</th><th class="n">Publicações</th><th class="n">Alcance</th><th class="n">Views</th><th class="n">Views médias</th><th class="n">Engajamento</th><th class="n">Taxa</th><th class="n">Seguidores/post</th><th class="n">Índice p/ marcas</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td><i class="dot" style="background:${pColor(r.pl)}"></i> ${esc(r.label)}</td><td class="n">${r.t.posts}</td><td class="n">${fmtInt(r.t.reach)}</td><td class="n">${fmtInt(r.t.views)}</td><td class="n">${fmtInt(r.t.avgViews)}</td><td class="n">${fmtInt(r.t.engagement)}</td><td class="n">${fmtPct(r.t.er)}</td><td class="n">${fmtDec(r.followsPer)}</td><td class="n">${fmtInt(r.potential)}</td></tr>`).join('')}</tbody></table></div>
      <div class="panel"><h3>Visualizações médias por formato</h3>
        ${rows.map((r) => `<div class="hbar-row"><span>${esc(r.label)}</span><div class="hbar-track"><div class="hbar-fill" style="width:${((r.t.avgViews || 0) / maxAvg * 100).toFixed(1)}%;background:${pColor(r.pl)}"></div></div><span class="num small"><b>${fmtInt(r.t.avgViews)}</b></span></div>`).join('')}
        <p class="small muted">Alcance fica em branco no YouTube porque a plataforma não fornece esse dado.</p></div>`;
  }

  // ----- Marcas -----
  function brandSummary(b, d) {
    const camps = d.campaigns.filter((c) => c.brand_id === b.id);
    const posts = d.posts.filter((p) => p.brand_id === b.id);
    const dels = d.deliverables.filter((x) => camps.some((c) => c.id === x.campaign_id));
    const prog = Calc.deliveryProgress(dels, d.posts);
    const t = Calc.totals(posts, state.cfg);
    const e = Calc.emv(posts, d.params);
    const active = camps.filter((c) => c.start_date <= state.db.meta.today && c.end_date >= state.db.meta.today);
    return { camps, posts, prog, t, e, active };
  }
  const logo = (b) => `<div class="logo" style="background:${BRAND_COLORS[brandIdx(b.id) % BRAND_COLORS.length]}" aria-hidden="true">${esc(b.name.split(' ').map((w) => w[0]).join('').slice(0, 2))}</div>`;

  function viewMarcas() {
    const d = scoped();
    return `<p class="section-sub">Todas as parcerias, de todos os períodos. Clique em uma marca para ver a página completa.</p>
      <div class="grid grid-3">${d.brands.map((b) => {
        const s = brandSummary(b, d);
        return `<a class="panel brand-card" href="#marca.${b.id}">
          <div class="brand-head">${logo(b)}<div><div class="brand-name">${esc(b.name)} ${b.demo ? '<span class="badge badge-demo">Fictícia</span>' : ''}</div><div class="small muted">${esc(b.segment)} · ${s.camps.length} campanha(s)${s.active.length ? ` · ${s.active.length} ativa(s)` : ''}</div></div></div>
          <div><div class="small" style="display:flex;justify-content:space-between"><span>Entregas</span><b class="num">${s.prog.counted}/${s.prog.expected} · ${fmtPct(s.prog.pct, 0)}</b></div><div class="progress ${s.prog.allComplete ? 'done' : ''}"><i style="width:${Math.min(100, s.prog.pct || 0)}%"></i></div></div>
          <div class="stat-row"><div class="stat"><span>Visualizações</span><b>${fmtInt(s.t.views)}</b></div><div class="stat"><span>Engajamentos</span><b>${fmtInt(s.t.engagement)}</b></div><div class="stat"><span>Valor equivalente ${estBadge}</span><b>${fmtBRL(s.e.total)}</b></div></div>
        </a>`;
      }).join('')}</div>`;
  }

  function viewMarca(brandId) {
    const d = scoped();
    const b = d.brands.find((x) => x.id === brandId);
    if (!b) return emptyState('Acesso restrito', isBrand() ? 'Você só tem acesso aos dados da sua marca.' : 'Marca não encontrada.');
    const camps = d.campaigns.filter((c) => c.brand_id === b.id).sort((x, y) => y.start_date.localeCompare(x.start_date));
    const cid = state.brandCampaign && camps.some((c) => c.id === state.brandCampaign) ? state.brandCampaign : '';
    const selCamps = cid ? camps.filter((c) => c.id === cid) : camps;
    const ids = new Set(selCamps.map((c) => c.id));
    const posts = d.posts.filter((p) => p.brand_id === b.id && ids.has(p.campaign_id));
    const dels = d.deliverables.filter((x) => ids.has(x.campaign_id));
    const prog = Calc.deliveryProgress(dels, d.posts);
    const t = Calc.totals(posts, state.cfg);
    const e = Calc.emv(posts, d.params);
    const fins = d.financials.filter((f) => ids.has(f.campaign_id));
    const fin = { contract_value: Calc.sum(fins, (f) => f.contract_value), media_value: Calc.sum(fins, (f) => f.media_value), product_value: Calc.sum(fins, (f) => f.product_value) };
    const bi = Calc.businessIndicators(fin, t, e.total);
    const start = selCamps.reduce((a, c) => (!a || c.start_date < a ? c.start_date : a), null);
    const end = selCamps.reduce((a, c) => (!a || c.end_date > a ? c.end_date : a), null);
    const usedParams = [...new Set(posts.map((p) => Calc.findParam(d.params, p)).filter(Boolean))];

    // Evolução: visualizações acumuladas por data de publicação dentro da parceria
    const days = []; if (start) for (let x = start; x <= (end < state.db.meta.today ? end : state.db.meta.today); x = Calc.addDays(x, 1)) days.push(x);
    let acc = 0; const cum = days.map((x) => { acc += Calc.sum(posts.filter((p) => p.published_at.slice(0, 10) === x), (p) => p.metrics.views) || 0; return acc; });

    const statusLine = prog.expected === 0 ? 'Sem entregas cadastradas' : prog.allComplete ? '100% das entregas concluídas' : `${fmtPct(prog.pct, 0)} das entregas concluídas`;
    return `
      <div class="panel" style="display:flex;flex-direction:column;gap:14px">
        <div class="brand-head">${logo(b)}<div style="flex:1;min-width:0"><div class="brand-name" style="font-size:20px">${esc(b.name)} ${b.demo ? '<span class="badge badge-demo">Marca fictícia</span>' : ''}</div><div class="small muted">${esc(b.segment)}</div></div>
          <label class="filter" for="brand-campaign"><span>Campanha</span><select id="brand-campaign" data-action="brand-campaign"><option value="">Todas (${camps.length})</option>${camps.map((c) => `<option value="${c.id}" ${c.id === cid ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label></div>
        <dl class="kv"><dt>Período da parceria</dt><dd>${start ? `${fmtDate(start)} – ${fmtDate(end)}` : '—'}</dd><dt>Status</dt><dd><span class="pill ${prog.allComplete ? 'pill-good' : prog.pct >= 50 ? 'pill-warn' : 'pill-neutral'}">${statusLine}</span></dd></dl>
      </div>
      <div class="grid grid-2">
        <div class="panel"><h3>Entregas contratadas x realizadas</h3><div class="deliver-list">
          ${prog.lines.map((l) => `<div class="deliver-row"><span>${l.complete ? '✓' : '○'} <b>${esc(l.label)}</b> <span class="muted small">${l.platform ? PLAT[l.platform] : 'Fora das redes'} · ${esc(campaignName(l.campaign_id))}</span>${l.manual ? ' ' + manualBadge() : ''}${l.cancelled ? ` <span class="badge badge-api">${l.cancelled} cancelado(s)</span>` : ''}</span><span class="num"><b>${l.delivered}</b> de ${l.expected}${l.delivered > l.expected ? ` <span class="pill pill-accent">+${l.delivered - l.expected} extra</span>` : ''}</span><div class="progress ${l.complete ? 'done' : ''}"><i style="width:${Math.min(100, l.expected ? l.delivered / l.expected * 100 : 0)}%"></i></div></div>`).join('') || '<p class="muted">Nenhuma entrega cadastrada.</p>'}
        </div></div>
        <div class="panel"><h3>Evolução da parceria · visualizações acumuladas</h3>${days.length > 1 ? Charts.line({ series: [{ name: 'Visualizações acumuladas', color: 'var(--accent)', values: cum }], labels: days, minZero: true }) : '<div class="empty"><strong>Parceria ainda não começou</strong><span>O gráfico aparece quando houver conteúdos publicados.</span></div>'}</div>
      </div>
      <section class="section"><div class="section-head"><h2>Investimento x Entrega x Resultado</h2><p class="section-sub">Colunas separadas por origem do dado</p></div>
        <div class="ier">
          <div class="ier-col"><h4>Investimento</h4><div>${manualBadge()}</div>
            <div class="ier-line"><span>Valor contratado</span><b>${fmtBRL(fin.contract_value)}</b></div>
            <div class="ier-line"><span>Valor de mídia</span><b>${fmtBRL(fin.media_value)}</b></div>
            <div class="ier-line"><span>Produtos / permutas</span><b>${fmtBRL(fin.product_value)}</b></div>
            <div class="ier-line"><span><b>Investimento total</b></span><b>${fmtBRL(bi.investment)}</b></div></div>
          <div class="ier-col"><h4>Entrega</h4><div>${calcBadge}</div>
            <div class="ier-line"><span>Entregas concluídas</span><b>${fmtPct(prog.pct, 0)}</b></div>
            <div class="ier-line"><span>Itens entregues</span><b>${prog.counted} de ${prog.expected}${prog.extra ? ` (+${prog.extra} extra)` : ''}</b></div>
            <div class="ier-line"><span>Conteúdos publicados</span><b>${t.posts}</b></div></div>
          <div class="ier-col"><h4>Resultado</h4><div>${apiBadge} <span class="small muted">dados da plataforma</span></div>
            <div class="ier-line"><span>Alcance ${tip('reach')}</span><b>${fmtInt(t.reach)}</b></div>
            <div class="ier-line"><span>Impressões ${tip('impressions')}</span><b>${fmtInt(t.impressions)}</b></div>
            <div class="ier-line"><span>Visualizações</span><b>${fmtInt(t.views)}</b></div>
            <div class="ier-line"><span>Engajamentos</span><b>${fmtInt(t.engagement)}</b></div>
            <div class="ier-line"><span>Taxa de engajamento ${tip('er')}</span><b>${fmtPct(t.er, 2)}</b></div>
            <div class="ier-line"><span>Cliques ${hasManual(posts, 'clicks') ? manualBadge() : ''}</span><b>${fmtInt(t.clicks)}</b></div></div>
        </div></section>
      <div class="grid grid-2">
        <div class="estimate-box"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>Valor equivalente de mídia (EMV)</b>${estBadge}${tip('emv')}</div>
          <div class="estimate-value">${fmtBRL(e.total)}</div>
          <div class="small">${usedParams.length ? usedParams.map((p) => `${PLAT[p.platform]}${p.format ? ' · ' + FORMAT[p.format] : ''}: ${p.basis === 'engagements' ? `${fmtBRL(p.rate)} por engajamento` : `CPM de referência ${p.rate.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} sobre ${p.basis === 'views' ? 'visualizações' : p.basis === 'reach' ? 'alcance' : 'impressões'}`}${p.demo ? ' <span class="badge badge-demo">parâmetro fictício</span>' : ''}`).join('<br>') : 'Nenhum parâmetro de referência cadastrado para estas plataformas.'}</div>
          ${e.missing.sem_parametro || e.missing.sem_metrica_base ? `<div class="small">Fora do cálculo: ${e.missing.sem_parametro} conteúdo(s) sem parâmetro, ${e.missing.sem_metrica_base} sem a métrica base.</div>` : ''}
          ${canEdit() ? '<a class="small" href="#parametros">Alterar parâmetros e metodologia</a>' : ''}</div>
        <div class="panel"><h3>Indicadores de negócio</h3>
          <div class="ier-line"><span>Custo por mil visualizações ${tip('cpmReal')} ${calcBadge}</span><b>${bi.cpmViews !== null ? bi.cpmViews.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</b></div>
          <div class="ier-line"><span>Custo por engajamento ${calcBadge}</span><b>${bi.costPerEngagement !== null ? bi.costPerEngagement.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</b></div>
          <div class="ier-line"><span>Retorno estimado sobre o investimento ${tip('roi')} ${estBadge}</span><b>${fmtPct(bi.roiEstimated, 0)}</b></div>
          <p class="small muted">Dados reais da plataforma e estimativas do modelo ficam separados. O retorno estimado depende inteiramente do CPM de referência cadastrado.</p></div>
      </div>
      <div class="panel"><h3>Conteúdos da parceria (${posts.length})</h3>
        <div class="content-grid">${Calc.rank(posts, 'views', state.cfg).map((p) => contentCard(p, null, 'views')).join('') || '<p class="muted">Nenhum conteúdo publicado ainda.</p>'}</div></div>`;
  }

  function viewEntregas() {
    const d = scoped();
    const f = effFilters();
    let items = d.deliveryItems.filter((i) => (!f.brand || i.brand_id === f.brand) && (!f.campaign || i.campaign_id === f.campaign) && (!f.deliveryStatus || i.status === f.deliveryStatus) && (!f.platforms.length || (i.platform && f.platforms.includes(i.platform))) && (!f.format || i.format === f.format));
    const counts = {}; for (const i of items) counts[i.status] = (counts[i.status] || 0) + 1;
    const edit = canEdit();
    return `<p class="section-sub">Uma linha por item contratado, em todas as datas. Os filtros de marca, campanha, plataforma, formato e status se aplicam aqui; o filtro de período não, para nenhuma entrega sumir da lista.</p>
      <div class="sync-strip">${Object.entries(STATUS).map(([k, [l]]) => `<span class="sync-chip">${statusPill(k)} <b class="num">${counts[k] || 0}</b></span>`).join('')}</div>
      ${items.length ? `<div class="table-wrap"><table><thead><tr><th>Marca</th><th>Campanha</th><th>Início</th><th>Fim</th><th>Entrega prevista</th><th>Realizada em</th><th>Plataforma</th><th>Formato</th><th>Link</th><th>Status</th><th class="n">Alcance</th><th class="n">Views</th><th class="n">Engaj.</th><th class="n">Valor estimado</th><th>Observações</th></tr></thead><tbody>
      ${items.map((i) => {
        const c = state.db.campaigns.find((x) => x.id === i.campaign_id);
        const p = i.post_id ? state.db.posts.find((x) => x.id === i.post_id) : null;
        const e = p ? Calc.emvForPost(p, d.params) : null;
        return `<tr><td>${esc(brandName(i.brand_id))}</td><td>${esc(c.name)}</td><td>${fmtDate(c.start_date)}</td><td>${fmtDate(c.end_date)}</td><td>${esc(i.label)} · ${fmtDate(i.expected_date)}</td><td>${fmtDate(i.delivered_date)}</td><td>${i.platform ? PLAT[i.platform] : '—'}</td><td>${i.format ? FORMAT[i.format] : '—'}</td>
          <td>${i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener">abrir ↗</a>` : '—'}</td>
          <td>${edit ? `<select aria-label="Status" data-action="item-status" data-id="${i.id}">${Object.entries(STATUS).map(([k, [l]]) => `<option value="${k}" ${k === i.status ? 'selected' : ''}>${l}</option>`).join('')}</select>` : statusPill(i.status)}</td>
          <td class="n">${p ? fmtInt(p.metrics.reach) : '—'}</td><td class="n">${p ? fmtInt(p.metrics.views) : '—'}</td><td class="n">${p ? fmtInt(Calc.engagement(p.metrics)) : '—'}</td><td class="n">${e && e.value !== null ? fmtBRL(e.value) : '—'}</td><td class="wrap">${esc(i.notes)}</td></tr>`;
      }).join('')}</tbody></table></div>` : emptyState('Nenhuma entrega com esses filtros', 'Ajuste marca, campanha ou status.')}
      <p class="small muted">"Valor estimado" é o EMV do conteúdo (Estimativa). Status "Publicado" é marcado automaticamente quando a sincronização encontra o post vinculado; os demais são atualizados pela equipe.</p>`;
  }

  function campaignStats(c, d) {
    const posts = d.posts.filter((p) => p.campaign_id === c.id);
    const t = Calc.totals(posts, state.cfg);
    const e = Calc.emv(posts, d.params);
    const fin = d.financials.find((f) => f.campaign_id === c.id);
    const prog = Calc.deliveryProgress(d.deliverables.filter((x) => x.campaign_id === c.id), d.posts);
    const bi = Calc.businessIndicators(fin, t, e.total);
    return { posts, t, e, fin, prog, bi };
  }
  function viewCampanhas() {
    const d = scoped();
    const f = effFilters();
    const camps = d.campaigns.filter((c) => (!f.brand || c.brand_id === f.brand) && (!f.campaign || c.id === f.campaign));
    const status = (c) => c.start_date > state.db.meta.today ? ['Planejada', 'neutral'] : c.end_date < state.db.meta.today ? ['Encerrada', 'accent'] : ['Em andamento', 'good'];
    const a = d.campaigns.find((c) => c.id === state.compareA) || d.campaigns[0];
    const b = d.campaigns.find((c) => c.id === state.compareB) || d.campaigns[1] || d.campaigns[0];
    const rows = [
      ['Marca', (c) => esc(brandName(c.brand_id))], ['Período', (c) => `${fmtDate(c.start_date)} – ${fmtDate(c.end_date)}`], ['Objetivo', (c) => esc(c.objective || '—')],
      ['Plataformas', (c) => c.platforms.map((p) => PLAT[p]).join(', ')], ['Conteúdos', (c, s) => s.t.posts], ['Entregas concluídas', (c, s) => fmtPct(s.prog.pct, 0)],
      ['Investimento <span class="badge badge-manual">Dado manual</span>', (c, s) => fmtBRL(s.bi.investment)], ['Alcance', (c, s) => fmtInt(s.t.reach)], ['Impressões', (c, s) => fmtInt(s.t.impressions)],
      ['Visualizações', (c, s) => fmtInt(s.t.views)], ['Engajamentos', (c, s) => fmtInt(s.t.engagement)], ['Taxa de engajamento', (c, s) => fmtPct(s.t.er, 2)],
      ['Cliques <span class="badge badge-manual">Dado manual</span>', (c, s) => fmtInt(s.t.clicks)], ['Conversões', () => '<span class="muted">Sem dado (informar pela marca)</span>'],
      ['Custo por mil views', (c, s) => s.bi.cpmViews !== null ? s.bi.cpmViews.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'],
      [`Valor equivalente ${estBadge}`, (c, s) => fmtBRL(s.e.total)],
    ];
    const opt = (sel) => d.campaigns.map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    return `<div class="grid grid-3">${camps.map((c) => { const s = campaignStats(c, d); const [st, tone] = status(c); return `<div class="panel" style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><b>${esc(c.name)}</b><div class="small muted">${esc(brandName(c.brand_id))} · ${fmtDate(c.start_date)} – ${fmtDate(c.end_date)}</div></div><span class="pill pill-${tone}">${st}</span></div>
        <div class="small">${esc(c.objective)}</div>
        <div class="progress ${s.prog.allComplete ? 'done' : ''}"><i style="width:${Math.min(100, s.prog.pct || 0)}%"></i></div><div class="small muted">Entregas: ${s.prog.counted}/${s.prog.expected}${s.prog.extra ? ` (+${s.prog.extra} extra)` : ''}</div>
        <div class="stat-row"><div class="stat"><span>Views</span><b>${fmtInt(s.t.views)}</b></div><div class="stat"><span>Engaj.</span><b>${fmtInt(s.t.engagement)}</b></div><div class="stat"><span>Investimento</span><b>${fmtBRL(s.bi.investment)}</b></div></div>
        ${c.goal_views ? `<div class="small">Meta de visualizações ${manualBadge()}: ${fmtInt(s.t.views)} de ${fmtInt(c.goal_views)} (${fmtPct(s.t.views / c.goal_views * 100, 0)})</div>` : ''}
      </div>`; }).join('') || emptyState('Nenhuma campanha', 'Nenhuma campanha corresponde aos filtros.')}</div>
      ${d.campaigns.length >= 2 ? `<section class="section"><div class="section-head"><h2>Campanha A x Campanha B</h2><p class="section-sub">Indicadores lado a lado, sem ranking</p></div>
        <div class="form-grid" style="max-width:640px"><label for="cmp-a">Campanha A<select id="cmp-a" data-action="cmp" data-side="A">${opt(a.id)}</select></label><label for="cmp-b">Campanha B<select id="cmp-b" data-action="cmp" data-side="B">${opt(b.id)}</select></label></div>
        <div class="table-wrap"><table><thead><tr><th>Indicador</th><th>${esc(a.name)}</th><th>${esc(b.name)}</th></tr></thead><tbody>
        ${(() => { const sa = campaignStats(a, d), sb = campaignStats(b, d); return rows.map(([l, fn]) => `<tr><td>${l}</td><td class="num">${fn(a, sa)}</td><td class="num">${fn(b, sb)}</td></tr>`).join(''); })()}
        </tbody></table></div>
        <p class="small muted">Campanhas com durações diferentes: compare também os valores por conteúdo e o custo por mil views.</p></section>` : ''}`;
  }

  function viewInsights() {
    const d = scoped(), ins = Insights.insights(d, effFilters(), state.cfg), al = Insights.alerts(d, state.filters, state.cfg, state.db.meta.now);
    const sev = { critical: ['Crítico', 'bad'], warning: ['Atenção', 'warn'], info: ['Info', 'neutral'] };
    return `<div class="grid grid-2">
      <div class="panel"><h3>Insights automáticos</h3><p class="small muted">Baseados exclusivamente nos dados disponíveis entre ${fmtDate(state.filters.start)} e ${fmtDate(state.filters.end)}, com os filtros aplicados.</p>
        ${ins.map((i) => `<div class="insight"><span class="insight-mark ${i.tone}"></span><span>${esc(i.text)}</span></div>`).join('')}</div>
      <div class="panel"><div class="section-head"><h3>Alertas (${al.length})</h3>${canEdit() ? '<a class="small" href="#parametros">Configurar limites</a>' : ''}</div>
        ${al.map((a) => `<div class="insight"><span class="pill pill-${sev[a.severity][1]}">${sev[a.severity][0]}</span><span>${esc(a.text)}</span></div>`).join('') || '<div class="empty"><strong>Nenhum alerta</strong><span>Tudo dentro dos limites configurados.</span></div>'}</div>
    </div>`;
  }

  const CONNECT = { instagram: 'meta', facebook: 'meta', tiktok: 'tiktok', youtube: 'google' };
  function viewIntegracoes() {
    const d = scoped();
    const runs = [...d.syncRuns].sort((a, b) => b.started_at.localeCompare(a.started_at));
    const HOW = {
      instagram: 'Instagram Graph API · conta Profissional (Business/Criador) · renovação do token a cada 60 dias',
      tiktok: 'TikTok API for Business (métricas de conta e vídeo) · token de 24 h com renovação automática',
      youtube: 'YouTube Data API v3 + YouTube Analytics API · OAuth Google · dados do Analytics chegam com 1 a 3 dias de atraso',
      facebook: 'Facebook Graph API (Página) · mesmo app da Meta usado pelo Instagram',
      linkedin: 'LinkedIn Community Management API · só Páginas de empresa, exige aprovação do app',
    };
    return `<div class="grid grid-2">${d.accounts.map((a) => {
      const last = runs.find((r) => r.account_id === a.id);
      const st = a.status === 'connected' ? (last && last.status === 'error' ? ['Erro na última sincronização', 'bad'] : ['Conectado', 'good']) : a.status === 'expired' ? ['Token expirado', 'bad'] : ['Não configurado', 'neutral'];
      return `<div class="panel" style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b><i class="dot" style="background:${pColor(a.platform)}"></i> ${PLAT[a.platform]}</b><span class="pill pill-${st[1]}">${st[0]}</span></div>
        <dl class="kv"><dt>Conta</dt><dd>${esc(a.handle)}</dd><dt>Última coleta</dt><dd>${a.last_synced_at ? fmtDateTime(a.last_synced_at) : '—'}</dd><dt>Conexão</dt><dd class="small">${HOW[a.platform]}</dd></dl>
        ${last && last.status === 'error' ? `<div class="callout callout-bad"><p>${esc(last.error)}</p></div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${LIVE && canEdit() && a.status !== 'connected' && CONNECT[a.platform] ? `<a class="btn btn-sm btn-primary" href="/api/connect/${CONNECT[a.platform]}">${a.status === 'not_configured' ? 'Conectar' : 'Reconectar'}${a.platform === 'facebook' || a.platform === 'instagram' ? ' via Meta' : ''}</a>` : ''}
          ${LIVE && canEdit() && a.status === 'connected' && CONNECT[a.platform] ? `<a class="btn btn-sm" href="/api/connect/${CONNECT[a.platform]}">Reconectar</a>` : ''}
          ${!LIVE && a.status === 'expired' && canEdit() ? `<button class="btn btn-sm btn-primary" data-action="reconnect" data-id="${a.id}">Reconectar (simulado)</button>` : ''}
          ${!LIVE && a.status === 'connected' && canEdit() ? `<label class="small" style="display:inline-flex;gap:6px;align-items:center" for="fail-${a.id}"><input type="checkbox" id="fail-${a.id}" data-action="simfail" data-id="${a.id}" ${state.simulateFail[a.id] ? 'checked' : ''}> Simular erro de API na próxima atualização</label>` : ''}
        </div></div>`;
    }).join('')}</div>
      <div class="panel"><h3>Rotina automática</h3><p class="small">Em produção: posts dos últimos 30 dias a cada 3 horas, Stories a cada hora (expiram em 24 h), série diária da conta às 04:30, planilha Google a cada 30 minutos. O botão "Atualizar dados" dispara a mesma rotina na hora.</p></div>
      <section class="section"><h2>Registro de sincronizações</h2>
        <div class="table-wrap"><table><thead><tr><th>Início</th><th>Plataforma</th><th>Origem</th><th>Status</th><th class="n">Posts atualizados</th><th>Erro</th></tr></thead><tbody>
        ${runs.slice(0, 30).map((r) => `<tr><td>${fmtDateTime(r.started_at)}</td><td>${PLAT[r.platform]}</td><td>${r.trigger === 'cron' ? 'Automática' : 'Manual'}</td><td>${r.status === 'success' ? '<span class="pill pill-good">Sucesso</span>' : '<span class="pill pill-bad">Erro</span>'}</td><td class="n">${fmtInt(r.posts)}</td><td class="wrap">${esc(r.error || '')}</td></tr>`).join('')}
        </tbody></table></div></section>`;
  }

  const SAMPLE_CSV = [
    'Plataforma;ID do post;Data;Formato;Título;Link;Campanha;Marca;Patrocinado;Alcance;Visualizações;Curtidas;Comentários;Compartilhamentos;Salvamentos;Cliques',
    'LinkedIn;li_9001;02/09/2026;Texto;Bastidores do Desafio 10K;https://exemplo.invalid/li/9001;;;não;3.200;;140;22;9;;',
    'LinkedIn;li_9002;15/09/2026;Vídeo;Como organizo minha semana;https://exemplo.invalid/li/9002;;;não;5,4k;7.900;310;41;18;;',
    'Instagram;ig_extra_1;20/09/2026;Story;Link da Aurora nos Stories;;Aurora · Primavera;Aurora Cosméticos;sim;2.100;2.300;35;3;1;;58',
    'LinkedIn;li_9002;15/09/2026;Vídeo;Como organizo minha semana (repetido);;;;não;5,4k;7.900;310;41;18;;',
    'TikTok;tt_x;31/09/2026;Vídeo;Data inválida;;;;não;;12.000;800;20;30;;',
    'Kwai;kw_1;10/09/2026;Vídeo;Plataforma não suportada;;;;não;;3.000;100;5;2;;',
    'Instagram;ig_extra_2;21/09/2026;Reels;Marca não cadastrada;;;Marca Inexistente;sim;9.000;15.000;700;30;40;60;',
  ].join('\n');

  function viewImportar() {
    if (!canEdit()) return emptyState('Sem permissão', 'Importação disponível só para a equipe com permissão de edição.');
    const dr = state.importDraft;
    let body = '';
    if (dr) {
      const opts = (f) => `<option value="">(não importar)</option>` + dr.parsed.header.map((h, i) => `<option value="${i}" ${dr.mapping[f] === i ? 'selected' : ''}>${esc(h)}</option>`).join('');
      const v = dr.result;
      body = `<div class="panel"><h3>2. Colunas identificadas em "${esc(dr.name)}"</h3><p class="small muted">${dr.parsed.rows.length} linhas · separador "${dr.parsed.delimiter === '\t' ? 'tab' : dr.parsed.delimiter}". Ajuste o mapeamento se alguma coluna não foi reconhecida.</p>
        <div class="form-grid">${Object.entries(Importer.FIELDS).map(([f, def]) => `<label for="map-${f}">${def.label}${def.required ? ' *' : ''}<select id="map-${f}" data-action="map" data-field="${f}">${opts(f)}</select></label>`).join('')}</div></div>
        <div class="panel"><h3>3. Validação</h3>
          ${v.fatal ? `<div class="callout callout-bad"><p>${esc(v.fatal)}</p></div>` : `
          <div class="sync-strip"><span class="sync-chip"><span class="ok">✓</span> ${v.valid.length} prontas para importar</span><span class="sync-chip"><span class="off">≡</span> ${v.duplicates.length} duplicadas (ignoradas)</span><span class="sync-chip"><span class="err">✕</span> ${v.errors.length} erro(s) em ${new Set(v.errors.map((e) => e.line)).size} linha(s)</span></div>
          ${v.errors.length ? `<div class="table-wrap"><table><thead><tr><th>Linha</th><th>Campo</th><th>Problema</th></tr></thead><tbody>${v.errors.map((e) => `<tr><td class="n">${e.line}</td><td>${esc(e.field)}</td><td class="wrap">${esc(e.msg)}</td></tr>`).join('')}</tbody></table></div>` : ''}
          ${v.duplicates.length ? `<div class="table-wrap"><table><thead><tr><th>Linha</th><th>Post</th><th>Motivo</th></tr></thead><tbody>${v.duplicates.map((e) => `<tr><td class="n">${e.line}</td><td>${esc(e.key)}</td><td>${esc(e.reason)}</td></tr>`).join('')}</tbody></table></div>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" data-action="do-import" ${v.valid.length ? '' : 'disabled'}>Importar ${v.valid.length} linha(s)</button><button class="btn" data-action="cancel-import">Cancelar</button></div>`}
        </div>`;
    }
    const imported = state.db.posts.filter((p) => p.source === 'import').length;
    return `<div class="panel"><h3>1. Enviar arquivo</h3>
        <div class="dropzone" id="dropzone"><b>Arraste um CSV ou Excel aqui</b><span class="small muted">ou</span>
          <label class="btn" for="file-input">Escolher arquivo</label><input type="file" id="file-input" accept=".csv,.txt,.xlsx,.xls" hidden>
          ${LIVE ? '' : '<button class="btn btn-sm" data-action="sample-import">Usar arquivo de exemplo (com erros de propósito)</button>'}
          <span class="small muted">Tudo que entra por aqui é marcado como "Dado manual". Duplicatas são detectadas por plataforma + ID do post.</span></div>
        ${imported ? `<p class="small">${imported} conteúdo(s) importado(s) nesta sessão já aparecem no dashboard.</p>` : ''}</div>
      ${body}
      <div class="panel"><h3>Google Sheets</h3><p class="small">Em produção, uma planilha com abas fixas (Contratos, Entregas, Investimentos, Parâmetros de CPM, Métricas manuais) é lida a cada 30 minutos pela conta de serviço do projeto e passa pela mesma validação desta tela. A equipe edita a planilha; o código não muda. O modelo de colunas está em <code>docs/05-integracoes.md</code>.</p></div>`;
  }

  function reportCSV(posts) {
    const cols = ['data', 'plataforma', 'formato', 'titulo', 'campanha', 'marca', 'patrocinado', 'alcance', 'impressoes', 'visualizacoes', 'curtidas', 'comentarios', 'compartilhamentos', 'salvamentos', 'cliques', 'engajamento', 'taxa_engajamento_pct', 'campos_manuais', 'link'];
    const q = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = posts.map((p) => { const m = p.metrics, er = Calc.postER(p, state.cfg); return [p.published_at.slice(0, 10), PLAT[p.platform], FORMAT[p.format], p.title, p.campaign_id ? campaignName(p.campaign_id) : '', p.brand_id ? brandName(p.brand_id) : '', p.sponsored ? 'sim' : 'não', m.reach, m.impressions, m.views, m.likes, m.comments, m.shares, m.saves, m.clicks, Calc.engagement(m), isNum(er) ? er.toFixed(2).replace('.', ',') : '', (p.manualFields || []).join(' '), p.url || ''].map(q).join(';'); });
    return [cols.join(';'), ...lines].join('\n');
  }

  function viewRelatorio() {
    const d = scoped(), cur = postsNow(d), prev = postsPrev(d);
    const t = Calc.totals(cur, state.cfg), tp = Calc.totals(prev, state.cfg);
    const monthName = new Date(state.filters.start + 'T12:00:00Z').toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' });
    const title = isBrand() ? brandName(state.viewer.brandId) : monthName.charAt(0).toUpperCase() + monthName.slice(1);
    const accs = activeAccounts(d);
    const pp = Calc.previousPeriod(state.filters.start, state.filters.end);
    const ins = Insights.insights(d, effFilters(), state.cfg);
    const brands = d.brands.filter((b) => cur.some((p) => p.brand_id === b.id) || d.campaigns.some((c) => c.brand_id === b.id && c.end_date >= state.filters.start && c.start_date <= state.filters.end));
    const camps = d.campaigns.filter((c) => c.end_date >= state.filters.start && c.start_date <= state.filters.end);
    const e = Calc.emv(cur.filter((p) => p.sponsored), d.params);
    const line = (v, l) => `<div class="arch-line"><b>${v}</b><span>${l}</span></div>`;
    return `<div class="panel report-controls" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between">
        <span class="small">Relatório do período <b>${fmtDate(state.filters.start)} – ${fmtDate(state.filters.end)}</b>, com os filtros atuais. Troque o período no topo para gerar outro mês.</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sm" data-action="copy-csv">Copiar dados em CSV</button>${LIVE ? '' : '<button class="btn btn-sm" data-action="copy-link">Copiar link compartilhável</button>'}</div>
        <p class="small muted" style="margin:0;flex-basis:100%">Na versão em produção o mesmo relatório sai em PDF, apresentação (PPTX), Excel e link com validade. Um PDF de exemplo gerado desta tela acompanha a entrega.</p></div>
      <div class="report" id="report">
        <div class="slide slide-cover"><div class="slide-kicker">Relatório de performance · ${isBrand() ? 'Parceria' : esc(LIVE ? (INJ.workspaceName || '') : 'Perfil Demo (fictício)')}</div><h2 class="slide-title">${esc(title)} ${state.filters.start.slice(0, 4)}</h2><div>${fmtDate(state.filters.start)} – ${fmtDate(state.filters.end)}</div></div>
        <div class="slide"><div class="slide-kicker">1 · Resumo executivo</div><h2 class="slide-title">Principais números</h2>
          <div class="grid grid-kpi">${kpi({ label: 'Visualizações', value: t.views, prev: tp.views, tipKey: 'views' })}${kpi({ label: 'Alcance', value: t.reach, prev: tp.reach, tipKey: 'reach' })}${kpi({ label: 'Engajamentos', value: t.engagement, prev: tp.engagement, tipKey: 'engagement' })}${kpi({ label: 'Taxa de engajamento', value: t.er, prev: tp.er, tipKey: 'er', fmt: (v) => fmtPct(v, 2) })}${kpi({ label: 'Conteúdos', value: t.posts, prev: tp.posts, tipKey: 'posts' })}</div></div>
        ${isBrand() ? '' : `<div class="slide"><div class="slide-kicker">2 · Crescimento das redes</div><h2 class="slide-title">Números atuais</h2>
          <div class="big-trio">${accs.map((a) => { const g = Calc.followerGrowth(d.daily, [a.id], state.filters.start, state.filters.end); const ps = cur.filter((p) => p.platform === a.platform); const tt = Calc.totals(ps, state.cfg); return `<div class="arch"><h4>${PLAT[a.platform]}</h4>${line(fmtInt(g.followers), a.platform === 'youtube' ? 'inscritos' : 'seguidores')}${line((g.gained > 0 ? '+' : '') + fmtInt(g.gained), 'ganho líquido')}${line(fmtInt(tt.views), 'views')}${line(a.platform === 'youtube' ? fmtHours(tt.watch_time_min) : fmtInt(tt.engagement), a.platform === 'youtube' ? 'watch time' : 'interações')}${a.status !== 'connected' ? '<span class="small">Dados até a desconexão</span>' : ''}</div>`; }).join('')}</div>
          <p class="small muted">Comparação com ${fmtDate(pp.start)} – ${fmtDate(pp.end)} disponível na Visão executiva.</p></div>`}
        <div class="slide"><div class="slide-kicker">3 · Conteúdos de destaque</div><h2 class="slide-title">Top conteúdos</h2>
          <div class="content-grid">${Calc.rank(cur, 'views', state.cfg).slice(0, 3).map((p, i) => contentCard(p, i + 1, 'views')).join('') || '<p class="muted">Sem conteúdos.</p>'}</div></div>
        <div class="slide"><div class="slide-kicker">4 · Performance por plataforma</div><h2 class="slide-title">Por plataforma</h2>
          <div class="table-wrap"><table><thead><tr><th>Plataforma</th><th class="n">Conteúdos</th><th class="n">Alcance</th><th class="n">Views</th><th class="n">Engajamentos</th><th class="n">Taxa</th></tr></thead><tbody>
          ${PLATFORMS.filter((p) => cur.some((x) => x.platform === p)).map((p) => { const tt = Calc.totals(cur.filter((x) => x.platform === p), state.cfg); return `<tr><td>${PLAT[p]}</td><td class="n">${tt.posts}</td><td class="n">${fmtInt(tt.reach)}</td><td class="n">${fmtInt(tt.views)}</td><td class="n">${fmtInt(tt.engagement)}</td><td class="n">${fmtPct(tt.er)}</td></tr>`; }).join('')}</tbody></table></div></div>
        <div class="slide"><div class="slide-kicker">5 · Marcas, campanhas e entregas</div><h2 class="slide-title">Parcerias no período</h2>
          <div class="table-wrap"><table><thead><tr><th>Campanha</th><th>Marca</th><th class="n">Entregas</th><th class="n">Views</th><th class="n">Engajamentos</th><th class="n">Valor equivalente (estimativa)</th></tr></thead><tbody>
          ${camps.map((c) => { const s = campaignStats(c, d); return `<tr><td>${esc(c.name)}</td><td>${esc(brandName(c.brand_id))}</td><td class="n">${s.prog.counted}/${s.prog.expected}</td><td class="n">${fmtInt(s.t.views)}</td><td class="n">${fmtInt(s.t.engagement)}</td><td class="n">${fmtBRL(s.e.total)}</td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">Nenhuma campanha no período.</td></tr>'}</tbody></table></div>
          <p class="small muted">${brands.length} marca(s) com atividade no período.</p></div>
        <div class="slide"><div class="slide-kicker">6 · Valor gerado</div><h2 class="slide-title">Valor equivalente</h2>
          <div class="estimate-box"><div style="display:flex;gap:8px;align-items:center"><b>Conteúdos patrocinados do período</b>${estBadge}</div><div class="estimate-value">${fmtBRL(e.total)}</div><div class="small">Calculado com os CPMs de referência cadastrados em Parâmetros. Não é receita nem dado da plataforma.</div></div></div>
        <div class="slide"><div class="slide-kicker">7 · Conclusões</div><h2 class="slide-title">O que os dados mostram</h2>
          ${ins.map((i) => `<div class="insight"><span class="insight-mark ${i.tone}"></span><span>${esc(i.text)}</span></div>`).join('')}
          <label for="editorial" class="small" style="font-weight:700;display:flex;gap:8px;align-items:center">Comentário editorial e próximos passos ${manualBadge()}</label>
          <textarea id="editorial" data-action="editorial" placeholder="Espaço para a análise da equipe (ex.: o que testar no próximo mês). Fica separado das conclusões automáticas.">${esc(state.editorial)}</textarea></div>
      </div>`;
  }

  function viewParametros() {
    if (!canEdit()) return emptyState('Sem permissão', 'Somente a equipe com permissão de edição altera parâmetros.');
    const p = state.db.params;
    const basisOpt = (v) => [['views', 'Visualizações (CPM)'], ['impressions', 'Impressões (CPM)'], ['reach', 'Alcance (CPM)'], ['engagements', 'Engajamentos (R$ por engajamento)']].map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('');
    const A = state.cfg.alerts;
    const num = (k, label, hint) => `<label for="al-${k}">${label}<input type="number" id="al-${k}" data-action="alert" data-key="${k}" value="${A[k]}" step="1"><span class="small muted" style="font-weight:400">${hint}</span></label>`;
    return `<section class="section"><div class="section-head"><h2>Valor equivalente de mídia (EMV)</h2>${estBadge}</div>
      <div class="callout callout-info"><p>O dashboard não sugere valores. Cadastre o CPM (ou valor por engajamento) que você usa como referência e descreva de onde ele veio. ${LIVE ? '' : 'Os valores abaixo são <b>fictícios, só para a demonstração</b>. '}Sem parâmetro, o EMV fica em branco.</p></div>
      <div class="table-wrap"><table><thead><tr><th>Plataforma</th><th>Formato</th><th>Base do cálculo</th><th class="n">Valor de referência (R$)</th><th>Metodologia / fonte</th><th>Vigência</th><th></th></tr></thead><tbody>
      ${p.map((x, i) => `<tr>
        <td><select aria-label="Plataforma" data-action="param" data-i="${i}" data-k="platform">${PLATFORMS.map((pl) => `<option value="${pl}" ${pl === x.platform ? 'selected' : ''}>${PLAT[pl]}</option>`).join('')}</select></td>
        <td><select aria-label="Formato" data-action="param" data-i="${i}" data-k="format"><option value="">Todos</option>${Object.entries(FORMAT).map(([k, l]) => `<option value="${k}" ${k === x.format ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td><select aria-label="Base" data-action="param" data-i="${i}" data-k="basis">${basisOpt(x.basis)}</select></td>
        <td class="n"><input type="number" aria-label="Valor" min="0" step="0.01" style="width:100px" data-action="param" data-i="${i}" data-k="rate" value="${x.rate ?? ''}"></td>
        <td class="wrap"><input type="text" aria-label="Metodologia" style="width:100%" data-action="param" data-i="${i}" data-k="methodology" value="${esc(x.methodology)}"></td>
        <td><input type="date" aria-label="Início da vigência" data-action="param" data-i="${i}" data-k="valid_from" value="${x.valid_from || ''}"></td>
        <td><button class="btn btn-sm" data-action="param-del" data-i="${i}">Remover</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nenhum parâmetro cadastrado. O EMV aparece em branco em todo o dashboard.</td></tr>'}
      </tbody></table></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sm" data-action="param-add">Adicionar parâmetro</button>${LIVE ? '' : '<button class="btn btn-sm" data-action="reset-cfg">Restaurar valores da demonstração</button>'}</div>
      <p class="small muted">Fórmula: para cada conteúdo, métrica base ÷ 1.000 × valor de referência (ou engajamentos × valor por engajamento). Um parâmetro de formato específico tem prioridade sobre o de "Todos".</p></section>
      <section class="section"><h2>Taxa de engajamento</h2><div class="form-grid" style="max-width:800px">
        ${['instagram', 'tiktok', 'youtube', 'facebook'].map((pl) => `<label for="er-${pl}">${PLAT[pl]}<select id="er-${pl}" data-action="erbase" data-platform="${pl}">${[['reach', 'Por alcance'], ['views', 'Por visualizações'], ['impressions', 'Por impressões']].map(([k, l]) => `<option value="${k}" ${state.cfg.erBase[pl] === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`).join('')}</div></section>
      <section class="section"><h2>Limites dos alertas</h2><div class="form-grid">
        ${num('reachDropPct', 'Queda de alcance/views (%)', 'Alerta quando cair mais que isso vs. período anterior')}
        ${num('followerDrop', 'Ganho líquido mínimo de seguidores', 'Abaixo disso gera alerta de queda')}
        ${num('campaignEndingDays', 'Campanha perto do fim (dias)', 'Com entregas incompletas')}
        ${num('missingMetricsHours', 'Conteúdo sem métricas (horas)', 'Tempo após publicar')}
        ${num('relevantChangePct', 'Variação relevante nos insights (%)', '')}
        ${num('outlierFactor', 'Conteúdo fora da curva (× mediana)', '')}
      </div></section>`;
  }

  function viewMetodologia() {
    const F = [
      ['Engajamento', 'curtidas + comentários + compartilhamentos + salvamentos (só os componentes que a plataforma fornece)'],
      ['Taxa de engajamento de um conteúdo', 'engajamento ÷ base × 100 · base: alcance (Instagram, Facebook), visualizações (TikTok, YouTube)'],
      ['Taxa de engajamento de um conjunto', 'Σ engajamentos ÷ Σ bases × 100 (ponderada pelo tamanho; não é média de taxas)'],
      ['Variação vs. período anterior', '(atual − anterior) ÷ anterior × 100 · período anterior = mesmo nº de dias, imediatamente antes · sem base quando anterior é 0 ou indisponível'],
      ['Seguidores no período', 'valor do último dia do período (soma das contas das plataformas selecionadas)'],
      ['Ganho líquido de seguidores', 'seguidores no último dia − seguidores no dia anterior ao início'],
      ['Visualizações médias por conteúdo', 'Σ visualizações ÷ nº de conteúdos com visualização disponível'],
      ['Engajamento médio por conteúdo', 'Σ engajamentos ÷ nº de conteúdos'],
      ['Entregas concluídas (%)', 'Σ mín(realizado, contratado) ÷ Σ contratado × 100 · extras não passam de 100% por linha · cancelados saem do contratado'],
      ['Investimento total', 'valor contratado + valor de mídia + produtos/permutas (Dado manual)'],
      ['Custo por mil visualizações', 'investimento ÷ visualizações × 1.000'],
      ['Custo por engajamento', 'investimento ÷ engajamentos'],
      ['EMV (estimativa)', 'Σ por conteúdo: métrica base ÷ 1.000 × CPM de referência, ou engajamentos × valor por engajamento'],
      ['Retorno estimado', '(EMV − investimento) ÷ investimento × 100 · só com investimento e EMV disponíveis'],
      ['Índice de potencial para marcas (formatos)', 'visualizações médias × taxa de engajamento ÷ 100'],
      ['Conteúdo acima/abaixo da média', 'taxa ≥ N × mediana do mesmo formato na mesma plataforma (N configurável, padrão 2) / ≤ mediana ÷ N · mínimo de 4 conteúdos no grupo'],
      ['Anomalia', 'dia com visualizações da conta mais de 3 desvios-padrão acima da média do período (mínimo de 10 dias)'],
    ];
    return `<div class="panel"><p class="small">Todas as fórmulas vivem em um único módulo (<code>lib/calc.js</code>) e estão documentadas em <code>docs/07-formulas.md</code>. Dado indisponível é tratado como ausente, nunca como zero.</p>
      <div class="table-wrap"><table><thead><tr><th>Indicador</th><th>Fórmula</th></tr></thead><tbody>${F.map(([a, b]) => `<tr><td><b>${a}</b></td><td class="wrap">${b}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="panel"><h3>Selos</h3><div style="display:flex;flex-direction:column;gap:8px">
        <div>${apiBadge} dado coletado da API oficial da plataforma</div><div>${manualBadge()} valor inserido à mão, importado de planilha ou arquivo</div>
        <div>${calcBadge} calculado pelo dashboard a partir de dados reais e manuais</div><div>${estBadge} resultado de modelo com parâmetros cadastrados (EMV, retorno estimado)</div></div></div>`;
  }

  // ---------- Roteamento ----------
  const TITLES = { visao: 'Visão executiva', redes: 'Por rede social', conteudos: 'Conteúdos em destaque', formatos: 'Análise de formatos', marcas: 'Marcas parceiras', marca: 'Marca parceira', entregas: 'Controle de entregas', campanhas: 'Campanhas', insights: 'Insights e alertas', integracoes: 'Integrações', importar: 'Importação manual', relatorio: 'Relatório', parametros: 'Parâmetros', metodologia: 'Metodologia' };
  const VIEWS = { visao: viewVisao, redes: viewRedes, conteudos: viewConteudos, formatos: viewFormatos, marcas: viewMarcas, marca: () => viewMarca(state.sub), entregas: viewEntregas, campanhas: viewCampanhas, insights: viewInsights, integracoes: viewIntegracoes, importar: viewImportar, relatorio: viewRelatorio, parametros: viewParametros, metodologia: viewMetodologia };

  function parseRoute() {
    const h = (location.hash || '').replace(/^#/, '');
    const [r, sub] = h.split('.');
    state.route = VIEWS[r] ? r : (isBrand() ? 'marca' : 'visao');
    state.sub = sub || null;
    if (isBrand()) {
      if (!ALLOWED_BRAND.includes(state.route)) { state.route = 'marca'; state.sub = state.viewer.brandId; }
      if (state.route === 'marca' && !state.sub) state.sub = state.viewer.brandId;
    }
  }

  function render() {
    parseRoute();
    Charts.reset();
    let title = TITLES[state.route];
    if (state.route === 'marca') { const b = scoped().brands.find((x) => x.id === state.sub); title = b ? b.name : 'Acesso restrito'; }
    if (state.route === 'redes') title = 'Por rede social';
    renderTopbar(title);
    renderNav();
    renderFilters();
    let html;
    try { html = VIEWS[state.route](); } catch (err) { console.error(err); html = `<div class="callout callout-bad"><p>Não foi possível montar esta tela: ${esc(err.message)}. Os demais módulos seguem funcionando.</p></div>`; }
    $('#view').innerHTML = html;
    document.title = 'Painel Influ · ' + title;
  }

  // ---------- Ações ----------
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 3200); }

  function applyPreset(k) {
    state.filters.preset = k;
    if (PRESETS[k][1]) { const [s, e] = PRESETS[k][1](); state.filters.start = s; state.filters.end = e; }
  }

  function syncNow() {
    if (state.syncing) return;
    if (LIVE) {
      state.syncing = true; render();
      api('POST', '/api/sync').then((r) => {
        const fail = (r.results || []).filter((x) => !x.ok).length;
        toast(fail ? `Atualização concluída com ${fail} erro(s). Veja Integrações.` : 'Atualização concluída.');
        setTimeout(() => location.reload(), 1200);
      }).catch((e) => { state.syncing = false; render(); toast('A atualização falhou: ' + e.message); });
      return;
    }
    state.syncing = true; render();
    setTimeout(() => {
      const now = new Date().toISOString();
      let ok = 0, fail = 0;
      for (const a of state.db.accounts) {
        if (a.status === 'not_configured') continue;
        const run = { id: 'run_' + (state.db.syncRuns.length + 1), account_id: a.id, platform: a.platform, trigger: 'manual', started_at: now, finished_at: now, status: 'success', posts: 0, error: null };
        if (a.status === 'expired') { run.status = 'error'; run.error = 'token_expired: reconecte a conta para voltar a coletar'; fail++; }
        else if (state.simulateFail[a.id]) { run.status = 'error'; run.error = 'rate_limited: limite de requisições atingido (HTTP 429). Nova tentativa automática em 15 minutos'; fail++; state.simulateFail[a.id] = false; }
        else {
          // Métricas de conteúdos recentes continuam crescendo: a API devolve valores novos
          const recent = state.db.posts.filter((p) => p.account_id === a.id && (Date.parse(state.db.meta.now) - Date.parse(p.published_at)) < 14 * 86400000);
          for (const p of recent) {
            if (p._apiPending) { p.metrics = { ...p._apiPending }; delete p._apiPending; }
            for (const k of ['reach', 'views', 'likes', 'comments', 'shares', 'impressions', 'watch_time_min']) if (isNum(p.metrics[k]) && !(p.manualFields || []).includes(k)) p.metrics[k] = Math.round(p.metrics[k] * (1.004 + Math.random() * 0.01));
          }
          for (const r of state.db.daily) if (r.account_id === a.id && r._apiPending) { Object.assign(r, r._apiPending); delete r._apiPending; }
          run.posts = recent.length; a.last_synced_at = now; ok++;
        }
        state.db.syncRuns.push(run);
      }
      state.db.meta.lastSync = now;
      state.syncing = false;
      render();
      toast(fail ? `Atualização concluída: ${ok} conta(s) atualizada(s), ${fail} com erro. Veja Integrações.` : `Atualização concluída: ${ok} conta(s) atualizada(s).`);
    }, 900);
  }

  function loadImportText(name, text) {
    const parsed = Importer.parseCSV(text);
    const mapping = Importer.suggestMapping(parsed.header);
    state.importDraft = { name, parsed, mapping, result: null };
    revalidate();
  }
  function revalidate() {
    const dr = state.importDraft;
    dr.result = Importer.validate(dr.parsed, dr.mapping, { posts: state.db.posts, brands: state.db.brands, campaigns: state.db.campaigns, today: state.db.meta.today });
    render();
  }
  function readFile(file) {
    const name = file.name;
    if (/\.xlsx?$/i.test(name)) {
      if (typeof XLSX === 'undefined') { toast('Leitor de Excel indisponível. Salve a planilha como CSV e tente de novo.'); return; }
      const fr = new FileReader(); // datas do Excel saem em ISO, nunca no formato americano (mês/dia)
      fr.onload = () => { try { const wb = XLSX.read(new Uint8Array(fr.result), { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' }); const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { FS: ';', dateNF: 'yyyy-mm-dd' }); loadImportText(name, csv); } catch (e) { toast('Não consegui ler este Excel: ' + e.message); } };
      fr.readAsArrayBuffer(file);
    } else {
      const fr = new FileReader();
      fr.onload = () => loadImportText(name, String(fr.result));
      fr.readAsText(file, 'utf-8');
    }
  }

  function copy(text, okMsg) {
    const done = () => toast(okMsg);
    try {
      navigator.clipboard.writeText(text).then(done, () => fallback());
    } catch (e) { fallback(); }
    function fallback() {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('Não foi possível copiar automaticamente.'); }
      ta.remove();
    }
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) {
      if (e.target.closest('.nav-link')) { $('#sidebar').classList.remove('open'); $('#menu-btn').setAttribute('aria-expanded', 'false'); }
      return;
    }
    const a = el.dataset.action;
    if (a === 'go') { location.hash = el.dataset.route; }
    else if (a === 'sync') syncNow();
    else if (a === 'platform') { const p = el.dataset.platform, arr = state.filters.platforms; state.filters.platforms = arr.includes(p) ? arr.filter((x) => x !== p) : [...arr, p]; render(); }
    else if (a === 'clear-filters') { Object.assign(state.filters, { platforms: [], brand: '', campaign: '', format: '', contentKind: '', contentType: '', deliveryStatus: '' }); render(); }
    else if (a === 'toggle-filters') { $('#filters').classList.toggle('open'); render(); }
    else if (a === 'more') { state.contentLimit += 24; render(); }
    else if (a === 'reconnect') { const acc = state.db.accounts.find((x) => x.id === el.dataset.id); acc.status = 'connected'; toast(`${PLAT[acc.platform]} reconectado. Clique em "Atualizar dados" para buscar o que ficou pendente.`); render(); }
    else if (a === 'sample-import') loadImportText('exemplo-importacao.csv', SAMPLE_CSV);
    else if (a === 'cancel-import') { state.importDraft = null; render(); }
    else if (a === 'do-import' && LIVE) {
      const v = state.importDraft.result.valid;
      el.disabled = true;
      api('POST', '/api/import', { fileName: state.importDraft.name, rows: v, mapping: state.importDraft.mapping, duplicates: state.importDraft.result.duplicates.length, errors: state.importDraft.result.errors })
        .then((r) => { toast(`${r.imported} conteúdo(s) importado(s).`); setTimeout(() => location.reload(), 1000); })
        .catch((e) => { el.disabled = false; toast('Importação falhou: ' + e.message); });
    }
    else if (a === 'do-import') {
      const v = state.importDraft.result.valid;
      for (const p of v) { p.account_id = (state.db.accounts.find((x) => x.platform === p.platform) || {}).id || null; p.hue = 200 + state.db.posts.length % 120; state.db.posts.push(p); }
      if (v.some((p) => p.platform === 'linkedin') && !state.db.accounts.find((x) => x.platform === 'linkedin' && x.status !== 'not_configured')) { /* LinkedIn por importação: conteúdos entram, conta segue sem API */ }
      state.audit.push({ at: new Date().toISOString(), action: 'import', rows: v.length });
      state.importDraft = null; render(); toast(`${v.length} conteúdo(s) importado(s). Dashboard atualizado.`);
    }
    else if (a === 'copy-csv') copy(reportCSV(postsNow()), 'CSV copiado. Cole no Excel ou Google Sheets.');
    else if (a === 'copy-link') copy('Exemplo de link (não funciona na demonstração): https://painel.exemplo/r/' + Math.random().toString(36).slice(2, 12) + ' · expira em 30 dias', 'Link de exemplo copiado.');
    else if (a === 'param-add') { state.db.params.push({ id: 'pm' + Date.now(), platform: 'instagram', format: null, basis: 'views', rate: null, methodology: '', valid_from: state.db.meta.today, valid_to: null }); saveCfg(); render(); }
    else if (a === 'param-del') { state.db.params.splice(+el.dataset.i, 1); saveCfg(); render(); }
    else if (a === 'reset-cfg') { try { localStorage.removeItem(CFG_KEY); } catch (err) { /* sem armazenamento */ } state.db.params = DemoData.build().params; state.cfg.erBase = { ...Calc.DEFAULT_ER_BASE }; state.cfg.alerts = { ...Insights.DEFAULT_ALERTS }; render(); toast('Parâmetros da demonstração restaurados.'); }
  });

  document.addEventListener('change', (e) => {
    const el = e.target, a = el.dataset.action;
    if (el.dataset.filter) { state.filters[el.dataset.filter] = el.value; if (el.dataset.filter === 'brand') state.filters.campaign = ''; render(); return; }
    if (el.dataset.date) { state.filters[el.dataset.date] = el.value; if (state.filters.start > state.filters.end) { const s = state.filters.start; state.filters.start = state.filters.end; state.filters.end = s; } render(); return; }
    if (el.id === 'viewer-select') {
      const v = el.value;
      state.viewer = v.startsWith('brand:') ? { role: 'brand', brandId: v.slice(6) } : { role: v, brandId: null };
      state.filters.brand = ''; state.filters.campaign = ''; state.importDraft = null; state.brandCampaign = '';
      location.hash = isBrand() ? 'marca.' + state.viewer.brandId : 'visao';
      renderViewerSelect(); render(); return;
    }
    if (el.id === 'file-input' && el.files[0]) { readFile(el.files[0]); return; }
    if (a === 'preset') { applyPreset(el.value); render(); }
    else if (a === 'compare') { state.compare = el.checked; render(); }
    else if (a === 'simfail') { state.simulateFail[el.dataset.id] = el.checked; }
    else if (a === 'sort') { state.sort = el.value; state.contentLimit = 24; render(); }
    else if (a === 'brand-campaign') { state.brandCampaign = el.value; render(); }
    else if (a === 'cmp') { state['compare' + el.dataset.side] = el.value; render(); }
    else if (a === 'item-status' && LIVE) { const it = state.db.deliveryItems.find((x) => x.id === el.dataset.id); const prev = it.status; it.status = el.value; render(); api('PATCH', '/api/delivery-items', { id: it.id, status: el.value }).then(() => toast('Status salvo.')).catch((e) => { it.status = prev; render(); toast('Não foi possível salvar: ' + e.message); }); }
    else if (a === 'item-status') { const it = state.db.deliveryItems.find((x) => x.id === el.dataset.id); state.audit.push({ at: new Date().toISOString(), action: 'status', id: it.id, from: it.status, to: el.value }); it.status = el.value; toast('Status atualizado para "' + STATUS[el.value][0] + '".'); render(); }
    else if (a === 'map') { state.importDraft.mapping[el.dataset.field] = el.value === '' ? undefined : +el.value; revalidate(); }
    else if (a === 'param') { const p = state.db.params[+el.dataset.i], k = el.dataset.k; p[k] = k === 'rate' ? (el.value === '' ? null : Math.max(0, +el.value)) : (el.value || null); if (k === 'methodology' || k === 'rate') p.demo = false; saveCfg(); render(); }
    else if (a === 'erbase') { state.cfg.erBase[el.dataset.platform] = el.value; saveCfg(); render(); }
    else if (a === 'alert') { const v = +el.value; if (Number.isFinite(v)) { state.cfg.alerts[el.dataset.key] = v; saveCfg(); render(); } }
  });
  document.addEventListener('input', (e) => { if (e.target.dataset.action === 'editorial') state.editorial = e.target.value; });

  // Arrastar e soltar arquivo
  document.addEventListener('dragover', (e) => { const z = e.target.closest && e.target.closest('#dropzone'); if (z) { e.preventDefault(); z.classList.add('drag'); } });
  document.addEventListener('dragleave', (e) => { const z = e.target.closest && e.target.closest('#dropzone'); if (z) z.classList.remove('drag'); });
  document.addEventListener('drop', (e) => { const z = e.target.closest && e.target.closest('#dropzone'); if (z) { e.preventDefault(); z.classList.remove('drag'); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); } });

  // Dicas (tooltips) em hover e foco
  const tt = $('#tooltip');
  function showTip(el) { tt.textContent = el.dataset.tip; tt.hidden = false; tt.dataset.src = 'tip'; const r = el.getBoundingClientRect(); const w = tt.offsetWidth; tt.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px'; tt.style.top = (r.bottom + 8 + tt.offsetHeight > window.innerHeight ? r.top - tt.offsetHeight - 8 : r.bottom + 8) + 'px'; }
  function hideTip() { if (tt.dataset.src === 'tip') { tt.hidden = true; tt.dataset.src = ''; } }
  document.addEventListener('mouseover', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) showTip(el); else hideTip(); });
  document.addEventListener('focusin', (e) => { if (e.target.dataset && e.target.dataset.tip) showTip(e.target); else hideTip(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { hideTip(); $('#sidebar').classList.remove('open'); } });
  Charts.attachHover(tt);

  $('#menu-btn').addEventListener('click', () => { const s = $('#sidebar'); s.classList.toggle('open'); $('#menu-btn').setAttribute('aria-expanded', s.classList.contains('open')); });
  window.addEventListener('hashchange', () => { render(); $('#view').focus({ preventScroll: true }); window.scrollTo(0, 0); });

  // Exposto para testes automatizados
  window.__painel = { state, render, syncNow };

  if (LIVE) {
    document.querySelector('.demo-banner').hidden = true;
    const box = document.querySelector('.viewer-box');
    box.innerHTML = `<span class="small"><b>${esc(INJ.userEmail || '')}</b></span>${(INJ.links || []).map((l) => `<a class="small" href="${esc(l.href)}">${esc(l.label)}</a>`).join('')}<a class="small" href="/auth/signout">Sair</a>`;
    box.style.display = 'grid'; box.style.gap = '6px';
    const qs = new URLSearchParams(location.search);
    const notice = qs.get('aviso') || qs.get('erro');
    if (notice) { setTimeout(() => toast(notice), 300); history.replaceState(null, '', location.pathname + location.hash); }
  } else renderViewerSelect();
  render();
})();
