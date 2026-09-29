/* DADOS FICTÍCIOS DE DEMONSTRAÇÃO
   Nenhum número aqui vem de conta real. Perfil, marcas, campanhas, valores e
   parâmetros de CPM foram inventados só para mostrar o funcionamento.
   Gerador determinístico (mesma semente = mesmos dados), usado também nos testes. */
(function (root) {
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function build(opts = {}) {
    const rnd = mulberry32(opts.seed || 20260929);
    const r = (a, b) => a + (b - a) * rnd();
    const ri = (a, b) => Math.round(r(a, b));
    const logn = (min, max) => Math.round(Math.exp(r(Math.log(min), Math.log(max))) * (rnd() < 0.06 ? r(2, 4) : 1)); // cauda longa + virais raros
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

    const NOW = opts.now || '2026-09-29T21:20:00Z'; // 29/09/2026 18:20 em Brasília
    const TODAY = NOW.slice(0, 10);
    const START = '2026-05-01';
    const DAY = 86400000;
    const iso = (t) => new Date(t).toISOString().slice(0, 10);
    const days = [];
    for (let t = Date.parse(START + 'T00:00:00Z'); iso(t) <= TODAY; t += DAY) days.push(iso(t));

    const accounts = [
      { id: 'acc_ig', platform: 'instagram', handle: '@perfil.demo', name: 'Perfil Demo', status: 'connected', base: 41200, dailyGain: [8, 30] },
      { id: 'acc_tt', platform: 'tiktok', handle: '@perfil.demo', name: 'Perfil Demo', status: 'connected', base: 30100, dailyGain: [2, 22] },
      { id: 'acc_yt', platform: 'youtube', handle: '@PerfilDemo', name: 'Perfil Demo', status: 'connected', base: 2900, dailyGain: [0, 5] },
      { id: 'acc_fb', platform: 'facebook', handle: 'Perfil Demo', name: 'Página Perfil Demo', status: 'expired', base: 8400, dailyGain: [-3, 3] },
      { id: 'acc_li', platform: 'linkedin', handle: '—', name: 'Não configurado', status: 'not_configured', base: null },
    ];
    const FB_BROKEN_SINCE = '2026-09-26'; // token expirou: posts depois disso ficam sem métricas

    const TOPICS = ['Rotina de treino da semana', 'Receita rápida de marmita', 'Review de tênis de corrida', 'Um dia comigo', 'Organização da casa nova', 'Respondendo perguntas de vocês', 'Meu treino de força', 'O que eu como antes de correr', 'Reforma do escritório, parte 1', 'Reforma do escritório, parte 2', 'Dicas para começar a correr', 'Mitos sobre alongamento', 'Compras do mês', 'Conversa sobre maternidade', 'Casamento e rotina', 'Bastidores de gravação', 'Viagem de fim de semana', 'Playlist para treinar', 'Erros comuns na corrida', 'Café da manhã em 5 minutos'];

    // Perfil de métricas por plataforma/formato. null = a API não fornece.
    function metricsFor(platform, format, ageDays, sponsored) {
      const grow = ageDays >= 7 ? 1 : 0.55 + 0.45 * (ageDays / 7);
      const m = { reach: null, impressions: null, views: null, likes: null, comments: null, shares: null, saves: null, clicks: null, follows: null, watch_time_min: null, avg_view_pct: null, thumb_ctr: null };
      const manual = [];
      if (platform === 'instagram') {
        const reach = format === 'reels' ? logn(7000, 55000) : format === 'carousel' ? logn(4000, 16000) : format === 'story' ? logn(1400, 4200) : logn(3000, 10000);
        m.reach = reach;
        m.views = Math.round(reach * (format === 'reels' ? r(1.3, 2.1) : format === 'story' ? r(1.05, 1.2) : r(1.4, 2)));
        m.likes = Math.round(reach * (format === 'story' ? r(0.01, 0.03) : r(0.03, 0.08)));
        m.comments = Math.round(reach * r(0.001, 0.006));
        m.shares = Math.round(reach * (format === 'story' ? r(0.001, 0.004) : r(0.003, 0.02)));
        m.saves = format === 'story' ? null : Math.round(reach * (format === 'carousel' ? r(0.01, 0.03) : r(0.003, 0.015)));
        m.follows = format === 'story' ? null : Math.round(reach * r(0.0003, 0.004));
        if (format === 'story' && sponsored) { m.clicks = Math.round(reach * r(0.005, 0.02)); manual.push('clicks'); } // link sticker: Dado manual
      } else if (platform === 'tiktok') {
        const views = logn(3000, 110000);
        m.views = views; m.reach = Math.round(views * r(0.7, 0.9));
        m.likes = Math.round(views * r(0.03, 0.1)); m.comments = Math.round(views * r(0.001, 0.004)); m.shares = Math.round(views * r(0.002, 0.02));
        m.avg_view_pct = +r(25, 60).toFixed(1);
        if (sponsored) { m.saves = Math.round(views * r(0.004, 0.012)); manual.push('saves'); } // salvamentos TikTok: Dado manual
      } else if (platform === 'youtube') {
        if (format === 'long_video') {
          const views = logn(700, 6500);
          m.views = views; m.impressions = Math.round(views * r(9, 22)); m.thumb_ctr = +((views / m.impressions) * 100).toFixed(1);
          m.watch_time_min = Math.round(views * r(3, 7)); m.avg_view_pct = +r(28, 55).toFixed(1); m.follows = Math.round(views * r(0.002, 0.01));
        } else {
          const views = logn(700, 18000);
          m.views = views; m.watch_time_min = Math.round(views * r(0.25, 0.45)); m.avg_view_pct = +r(60, 95).toFixed(1); m.follows = Math.round(views * r(0.0005, 0.003));
        }
        m.likes = Math.round(m.views * r(0.02, 0.05)); m.comments = Math.round(m.views * r(0.001, 0.005)); m.shares = Math.round(m.views * r(0.001, 0.004));
      } else if (platform === 'facebook') {
        const reach = format === 'video' ? logn(600, 5000) : logn(700, 3000);
        m.reach = reach; m.views = Math.round(reach * r(1.1, 1.4));
        m.likes = Math.round(reach * r(0.01, 0.04)); m.comments = Math.round(reach * r(0.001, 0.004)); m.shares = Math.round(reach * r(0.001, 0.006));
      }
      for (const k of Object.keys(m)) if (typeof m[k] === 'number' && !['avg_view_pct', 'thumb_ctr'].includes(k)) m[k] = Math.round(m[k] * grow);
      return { m, manual };
    }

    const posts = [];
    let seq = 0;
    function addPost(platform, format, day, extra = {}) {
      const acc = accounts.find((a) => a.platform === platform);
      const age = (Date.parse(NOW) - Date.parse(day + 'T15:00:00Z')) / DAY;
      const { m, manual } = metricsFor(platform, format, age, !!extra.sponsored);
      const id = `post_${++seq}`;
      const p = {
        id, platform, account_id: acc.id, external_id: `${platform.slice(0, 2)}_${1000 + seq}`, published_at: `${day}T${String(ri(11, 21)).padStart(2, '0')}:00:00Z`,
        format, title: extra.title || pick(TOPICS), url: `https://exemplo.invalid/${platform}/${1000 + seq}`,
        brand_id: null, campaign_id: null, deliverable_id: null, sponsored: false, metrics: m, manualFields: manual, source: 'api', hue: ri(0, 359), ...extra,
      };
      if (platform === 'facebook' && day >= FB_BROKEN_SINCE) { p._apiPending = { ...p.metrics }; for (const k of Object.keys(p.metrics)) p.metrics[k] = null; p.manualFields = []; } // o que a API devolverá após reconectar
      posts.push(p);
      return p;
    }

    // Conteúdo orgânico
    days.forEach((d, i) => {
      const dow = new Date(d + 'T00:00:00Z').getUTCDay();
      if ([1, 3, 5].includes(dow)) addPost('instagram', rnd() < 0.7 ? 'reels' : 'carousel', d);
      if (dow === 6 && rnd() < 0.6) addPost('instagram', 'photo', d);
      if (rnd() < 0.45) addPost('instagram', 'story', d);
      if ([0, 2, 4].includes(dow) || rnd() < 0.15) addPost('tiktok', 'video', d);
      if ([2, 5].includes(dow)) addPost('youtube', 'short', d);
      if (i % 16 === 8) addPost('youtube', 'long_video', d, { title: pick(['Vlog: semana de reforma', 'Tudo sobre minha primeira meia maratona', 'Respondendo 50 perguntas', 'Tour pela casa nova']) });
      if ([2, 6].includes(dow)) addPost('facebook', rnd() < 0.5 ? 'video' : 'photo', d);
    });

    // ---------- Marcas, campanhas, entregas (FICTÍCIAS) ----------
    const brands = [
      { id: 'br_aurora', name: 'Aurora Cosméticos', segment: 'Beleza', color: 0, demo: true },
      { id: 'br_trilha', name: 'Trilha Esportes', segment: 'Artigos esportivos', color: 1, demo: true },
      { id: 'br_nimbus', name: 'Casa Nimbus', segment: 'Casa e decoração', color: 2, demo: true },
    ];
    const campaigns = [
      { id: 'cp_aur_ago', brand_id: 'br_aurora', name: 'Aurora · Glow de Agosto', objective: 'Lançamento do sérum', start_date: '2026-08-01', end_date: '2026-08-31', platforms: ['instagram', 'tiktok'] },
      { id: 'cp_aur_prim', brand_id: 'br_aurora', name: 'Aurora · Primavera', objective: 'Reconhecimento de marca', start_date: '2026-09-10', end_date: '2026-10-10', platforms: ['instagram', 'youtube'] },
      { id: 'cp_tri_inv', brand_id: 'br_trilha', name: 'Trilha · Inverno em Movimento', objective: 'Venda de linha térmica', start_date: '2026-06-15', end_date: '2026-07-15', platforms: ['instagram', 'tiktok'] },
      { id: 'cp_tri_10k', brand_id: 'br_trilha', name: 'Trilha · Desafio 10K', objective: 'Engajamento com o desafio', start_date: '2026-09-01', end_date: '2026-10-03', platforms: ['instagram', 'tiktok', 'youtube'], goal_views: 450000 },
      { id: 'cp_nim_out', brand_id: 'br_nimbus', name: 'Casa Nimbus · Reforma', objective: 'Série sobre reforma', start_date: '2026-10-05', end_date: '2026-11-05', platforms: ['instagram', 'youtube'] },
    ];
    const financials = [
      { campaign_id: 'cp_aur_ago', contract_value: 12000, media_value: 3000, product_value: 1500, source: 'manual' },
      { campaign_id: 'cp_aur_prim', contract_value: 9000, media_value: null, product_value: 800, source: 'manual' },
      { campaign_id: 'cp_tri_inv', contract_value: 8000, media_value: null, product_value: 1200, source: 'manual' },
      { campaign_id: 'cp_tri_10k', contract_value: 20000, media_value: 2500, product_value: 2400, source: 'manual' },
      { campaign_id: 'cp_nim_out', contract_value: 15000, media_value: null, product_value: null, source: 'manual' },
    ];
    // Linhas contratadas: [id, campanha, plataforma, formato, rótulo, contratado, publicar (entregues), prazo]
    const lines = [
      ['dl1', 'cp_aur_ago', 'instagram', 'reels', 'Reels', 2, 2, '2026-08-25'],
      ['dl2', 'cp_aur_ago', 'instagram', 'story', 'Stories', 5, 6, '2026-08-31'],
      ['dl3', 'cp_aur_ago', 'tiktok', 'video', 'TikTok', 1, 1, '2026-08-25'],
      ['dl4', 'cp_aur_ago', null, null, 'Presença em evento', 1, null, '2026-08-20', 1],
      ['dl5', 'cp_aur_prim', 'instagram', 'reels', 'Reels', 1, 1, '2026-10-05'],
      ['dl6', 'cp_aur_prim', 'instagram', 'story', 'Stories', 3, 2, '2026-10-08'],
      ['dl7', 'cp_aur_prim', 'youtube', 'short', 'YouTube Shorts', 1, 0, '2026-10-08'],
      ['dl8', 'cp_tri_inv', 'instagram', 'reels', 'Reels', 2, 2, '2026-07-10'],
      ['dl9', 'cp_tri_inv', 'tiktok', 'video', 'TikTok', 2, 2, '2026-07-10'],
      ['dl10', 'cp_tri_inv', 'instagram', 'story', 'Stories', 4, 3, '2026-07-15'],
      ['dl11', 'cp_tri_10k', 'instagram', 'reels', 'Reels', 3, 2, '2026-09-30'],
      ['dl12', 'cp_tri_10k', 'tiktok', 'video', 'TikTok', 2, 2, '2026-09-28'],
      ['dl13', 'cp_tri_10k', 'youtube', 'long_video', 'Vídeo longo no YouTube', 1, 0, '2026-09-25'],
      ['dl14', 'cp_tri_10k', 'instagram', 'story', 'Stories', 4, 4, '2026-10-03'],
      ['dl15', 'cp_nim_out', 'instagram', 'reels', 'Reels', 2, 0, '2026-10-20'],
      ['dl16', 'cp_nim_out', 'youtube', 'long_video', 'Vídeo longo no YouTube', 1, 0, '2026-10-30'],
    ];
    const brandTitles = {
      br_aurora: ['Minha rotina de pele com o sérum Aurora', 'Testei por 30 dias: sérum Aurora', 'Pele pós-treino com Aurora', 'Nécessaire de viagem Aurora', 'Aurora na primavera'],
      br_trilha: ['Desafio 10K: semana 1', 'Desafio 10K: o tênis que estou usando', 'Frio e treino: linha térmica Trilha', 'Desafio 10K: dia da prova', 'Treino no inverno com Trilha'],
    };
    const deliverables = [], deliveryItems = [];
    let itemSeq = 0;
    for (const [id, cid, platform, format, label, expected, publish, due, manualDone] of lines) {
      const c = campaigns.find((x) => x.id === cid);
      deliverables.push({ id, campaign_id: cid, platform, format, label, expected, due_date: due, delivered_manual: manualDone ?? null, status: null });
      const pubDays = days.filter((d) => d >= c.start_date && d <= c.end_date && d <= TODAY);
      const created = [];
      for (let k = 0; k < (publish || 0); k++) {
        const d = pubDays[Math.min(pubDays.length - 1, Math.floor((k + 0.5) * pubDays.length / Math.max(publish, 1)))];
        const titles = brandTitles[c.brand_id] || ['Conteúdo de marca'];
        created.push(addPost(platform, format, d, { sponsored: true, brand_id: c.brand_id, campaign_id: cid, deliverable_id: id, title: titles[(k + itemSeq) % titles.length] }));
      }
      // Controle de entregas: uma linha por unidade contratada (e extras entregues)
      const units = Math.max(expected, publish || 0);
      for (let k = 0; k < units; k++) {
        const p = created[k];
        const campEnded = c.end_date < TODAY;
        let status, obs = '';
        if (!platform) { status = manualDone > k ? 'entregue' : 'planejado'; obs = 'Entrega fora das redes: confirmada manualmente'; }
        else if (p) { status = campEnded ? 'entregue' : 'publicado'; if (k >= expected) obs = 'Entrega extra (além do contratado)'; }
        else if (due < TODAY) { status = 'pendente'; obs = 'Prazo vencido'; }
        else if (cid === 'cp_nim_out') status = 'planejado';
        else status = k === units - 1 ? 'aguardando_aprovacao' : 'em_producao';
        if (cid === 'cp_tri_inv' && !p && platform) { status = 'cancelado'; obs = 'Cancelado em comum acordo com a marca'; }
        deliveryItems.push({ id: `di_${++itemSeq}`, campaign_id: cid, deliverable_id: id, brand_id: c.brand_id, platform, format, label, expected_date: due, post_id: p ? p.id : null, delivered_date: p ? p.published_at.slice(0, 10) : (status === 'entregue' ? '2026-08-20' : null), url: p ? p.url : null, status, notes: obs, internal_notes: '' });
      }
    }
    // 1 story da campanha de inverno foi cancelado em comum acordo: sai do contratado
    deliverables.find((d) => d.id === 'dl10').cancelled = 1;

    // ---------- Série diária das contas ----------
    const daily = [];
    for (const acc of accounts) {
      if (acc.base === null) continue;
      let f = acc.base;
      for (const d of days) {
        let gain = ri(acc.dailyGain[0], acc.dailyGain[1]);
        if (acc.platform === 'facebook' && d >= '2026-09-01') gain = ri(-6, 1); // queda para demonstrar alerta
        f += gain;
        const ps = posts.filter((p) => p.account_id === acc.id && p.published_at.slice(0, 10) <= d);
        const recent = ps.filter((p) => (Date.parse(d) - Date.parse(p.published_at.slice(0, 10))) / DAY < 5);
        let views = Math.round(recent.reduce((a, p) => a + (p.metrics.views || 0) / 5, 0) + ri(200, 900));
        if (acc.platform === 'tiktok' && d === '2026-09-14') views *= 9; // pico para demonstrar anomalia
        const broken = acc.platform === 'facebook' && d >= FB_BROKEN_SINCE;
        daily.push({ account_id: acc.id, day: d, _apiPending: broken ? { followers: f, views, reach: Math.round(views * 0.65) } : undefined, followers: broken ? null : f, followers_gained: broken ? null : Math.max(gain, 0), views: broken ? null : views, reach: broken ? null : Math.round(views * r(0.55, 0.75)), source: 'api' });
      }
    }

    // ---------- Parâmetros de valor (FICTÍCIOS) ----------
    const DEMO_NOTE = 'Parâmetro fictício de demonstração. Substitua pelo valor de referência da sua tabela de mídia.';
    const params = [
      { id: 'pm1', platform: 'instagram', format: null, basis: 'views', rate: 18, methodology: DEMO_NOTE, valid_from: '2026-01-01', valid_to: null, demo: true },
      { id: 'pm2', platform: 'tiktok', format: null, basis: 'views', rate: 10, methodology: DEMO_NOTE, valid_from: '2026-01-01', valid_to: null, demo: true },
      { id: 'pm3', platform: 'youtube', format: null, basis: 'views', rate: 22, methodology: DEMO_NOTE, valid_from: '2026-01-01', valid_to: null, demo: true },
      { id: 'pm4', platform: 'facebook', format: null, basis: 'views', rate: 8, methodology: DEMO_NOTE, valid_from: '2026-01-01', valid_to: null, demo: true },
    ];

    // ---------- Log de sincronização ----------
    const syncRuns = [];
    const runAt = ['2026-09-29T15:20:00Z', '2026-09-29T18:20:00Z', '2026-09-29T21:20:00Z'];
    for (const t of runAt) for (const acc of accounts) {
      if (acc.status === 'not_configured') continue;
      const err = acc.platform === 'facebook';
      syncRuns.push({ id: `run_${syncRuns.length + 1}`, account_id: acc.id, platform: acc.platform, trigger: 'cron', started_at: t, finished_at: t, status: err ? 'error' : 'success', posts: err ? 0 : ri(20, 45), error: err ? 'token_expired: o token de acesso da Página expirou em 26/09/2026' : null });
    }

    for (const a of accounts) a.last_synced_at = a.status === 'connected' ? NOW : (a.platform === 'facebook' ? '2026-09-26T09:00:00Z' : null);
    return { accounts, daily, posts, brands, campaigns, financials, deliverables, deliveryItems, params, syncRuns, meta: { now: NOW, today: TODAY, dataStart: START, demo: true, lastSync: NOW } };
  }

  const api = { build };
  root.DemoData = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
