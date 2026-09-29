/* Importação manual (CSV / Excel / Google Sheets exportado).
   Fluxo: ler → identificar colunas → mapear → validar → deduplicar → importar.
   Todo valor importado recebe source 'import' e aparece como "Dado manual". */
(function (root) {
  // Campo interno → nomes de coluna aceitos (comparação sem acento/caixa/espaço)
  const FIELDS = {
    platform: { label: 'Plataforma', required: true, aliases: ['plataforma', 'rede', 'redesocial', 'platform', 'network'] },
    external_id: { label: 'ID do post', required: true, aliases: ['idpost', 'id', 'postid', 'iddopost', 'codigo'] },
    date: { label: 'Data', required: true, aliases: ['data', 'date', 'datapublicacao', 'publicadoem', 'published'] },
    format: { label: 'Formato', required: true, aliases: ['formato', 'format', 'tipo'] },
    title: { label: 'Título/descrição', aliases: ['titulo', 'descricao', 'title', 'legenda', 'caption'] },
    url: { label: 'Link', aliases: ['link', 'url', 'linkdoconteudo'] },
    campaign: { label: 'Campanha', aliases: ['campanha', 'campaign'] },
    brand: { label: 'Marca', aliases: ['marca', 'brand', 'parceiro'] },
    sponsored: { label: 'Patrocinado', aliases: ['patrocinado', 'publi', 'sponsored', 'pago'] },
    reach: { label: 'Alcance', metric: true, aliases: ['alcance', 'reach', 'contasalcancadas'] },
    impressions: { label: 'Impressões', metric: true, aliases: ['impressoes', 'impressions'] },
    views: { label: 'Visualizações', metric: true, aliases: ['visualizacoes', 'views', 'plays', 'reproducoes'] },
    likes: { label: 'Curtidas', metric: true, aliases: ['curtidas', 'likes', 'reacoes'] },
    comments: { label: 'Comentários', metric: true, aliases: ['comentarios', 'comments', 'coment'] },
    shares: { label: 'Compartilhamentos', metric: true, aliases: ['compartilhamentos', 'shares', 'comp', 'reposts'] },
    saves: { label: 'Salvamentos', metric: true, aliases: ['salvamentos', 'saves', 'salvos', 'salv'] },
    clicks: { label: 'Cliques', metric: true, aliases: ['cliques', 'clicks', 'cliquesnolink'] },
  };
  const PLATFORMS = { instagram: 'instagram', ig: 'instagram', insta: 'instagram', tiktok: 'tiktok', tt: 'tiktok', youtube: 'youtube', yt: 'youtube', facebook: 'facebook', fb: 'facebook', linkedin: 'linkedin' };
  const FORMATS = { reels: 'reels', reel: 'reels', story: 'story', stories: 'story', carrossel: 'carousel', carousel: 'carousel', foto: 'photo', photo: 'photo', imagem: 'photo', video: 'video', short: 'short', shorts: 'short', videolongo: 'long_video', longo: 'long_video', live: 'live', texto: 'text' };

  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // CSV com detecção de separador (; é comum em planilhas brasileiras) e aspas
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/)[0] || '';
    const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : (firstLine.includes('\t') ? '\t' : ',');
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some((v) => v.trim() !== '')) rows.push(row);
        row = [];
      } else cell += c;
    }
    row.push(cell);
    if (row.some((v) => v.trim() !== '')) rows.push(row);
    return { delimiter: delim, header: (rows[0] || []).map((h) => h.trim()), rows: rows.slice(1) };
  }

  // Sugere o mapeamento coluna → campo
  function suggestMapping(header) {
    const map = {};
    header.forEach((h, idx) => {
      const n = norm(h);
      for (const [field, def] of Object.entries(FIELDS)) {
        if (map[field] !== undefined) continue;
        if (def.aliases.includes(n)) { map[field] = idx; break; }
      }
    });
    return map;
  }

  // Números no formato brasileiro ou internacional; aceita 12,5k / 2,1mi / 1.234
  function parseNumber(raw) {
    let s = String(raw ?? '').trim().toLowerCase().replace(/\s/g, '');
    if (s === '' || s === '-' || s === '—' || s === 'n/d' || s === 'na') return { value: null, empty: true };
    let mult = 1;
    const suf = s.match(/(mil|mi|k|m)$/);
    if (suf) { mult = suf[1] === 'k' || suf[1] === 'mil' ? 1e3 : 1e6; s = s.slice(0, -suf[1].length); }
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');      // 1.234,5
    else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');                     // 1,234.5
    else s = s.replace(',', '.');                                                              // 12,5
    if (!/^\d+(\.\d+)?$/.test(s)) return { value: null, error: true };
    return { value: Math.round(parseFloat(s) * mult) };
  }

  function parseDate(raw) {
    const s = String(raw ?? '').trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return valid(m[1], m[2], m[3]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return valid(m[3], m[2].padStart(2, '0'), m[1].padStart(2, '0'));
    return null;
    function valid(y, mo, d) {
      const iso = `${y}-${mo}-${d}`;
      const dt = new Date(iso + 'T00:00:00Z');
      return !isNaN(dt) && dt.toISOString().slice(0, 10) === iso ? iso : null;
    }
  }

  function parseBool(raw) {
    const n = norm(raw);
    if (['sim', 's', 'yes', 'y', 'true', '1', 'x', 'patrocinado', 'publi'].includes(n)) return true;
    if (['nao', 'n', 'no', 'false', '0', '', 'organico'].includes(n)) return false;
    return null;
  }

  // Valida linhas e separa válidas, duplicadas e com erro
  function validate(parsed, mapping, ctx) {
    const errors = [], valid = [], duplicates = [];
    const missingRequired = Object.entries(FIELDS).filter(([f, d]) => d.required && mapping[f] === undefined).map(([, d]) => d.label);
    if (missingRequired.length) return { fatal: `Colunas obrigatórias não mapeadas: ${missingRequired.join(', ')}`, errors, valid, duplicates };

    const existing = new Set((ctx.posts || []).map((p) => `${p.platform}|${p.external_id}`));
    const seen = new Set();
    const brandByName = new Map((ctx.brands || []).map((b) => [norm(b.name), b]));
    const campByName = new Map((ctx.campaigns || []).map((c) => [norm(c.name), c]));
    const today = ctx.today || new Date().toISOString().slice(0, 10);

    parsed.rows.forEach((cells, i) => {
      const line = i + 2; // +1 cabeçalho, +1 base 1
      const get = (f) => mapping[f] === undefined ? '' : (cells[mapping[f]] ?? '').trim();
      const rowErr = (field, msg) => errors.push({ line, field: FIELDS[field] ? FIELDS[field].label : field, msg });
      let ok = true;

      const platform = PLATFORMS[norm(get('platform'))];
      if (!platform) { rowErr('platform', `Plataforma desconhecida: "${get('platform')}"`); ok = false; }
      const external_id = get('external_id');
      if (!external_id) { rowErr('external_id', 'ID do post vazio'); ok = false; }
      const date = parseDate(get('date'));
      if (!date) { rowErr('date', `Data inválida: "${get('date')}" (use dd/mm/aaaa ou aaaa-mm-dd)`); ok = false; }
      else if (date > today) { rowErr('date', `Data no futuro: ${date}`); ok = false; }
      const format = FORMATS[norm(get('format'))];
      if (!format) { rowErr('format', `Formato desconhecido: "${get('format')}"`); ok = false; }

      const metrics = {};
      for (const [f, def] of Object.entries(FIELDS)) {
        if (!def.metric) continue;
        const r = parseNumber(get(f));
        if (r.error) { rowErr(f, `Número inválido: "${get(f)}"`); ok = false; }
        metrics[f] = r.value;
      }
      if (ok && Object.values(metrics).every((v) => v === null)) { rowErr('views', 'Linha sem nenhuma métrica'); ok = false; }

      let brand = null, campaign = null;
      if (get('brand')) { brand = brandByName.get(norm(get('brand'))); if (!brand) { rowErr('brand', `Marca não cadastrada: "${get('brand')}"`); ok = false; } }
      if (get('campaign')) { campaign = campByName.get(norm(get('campaign'))); if (!campaign) { rowErr('campaign', `Campanha não cadastrada: "${get('campaign')}"`); ok = false; } }
      if (campaign && brand && campaign.brand_id !== brand.id) { rowErr('campaign', 'Campanha pertence a outra marca'); ok = false; }
      const sponsoredRaw = get('sponsored');
      const sponsored = sponsoredRaw === '' ? !!(brand || campaign) : parseBool(sponsoredRaw);
      if (sponsored === null) { rowErr('sponsored', `Valor inválido: "${sponsoredRaw}" (use sim/não)`); ok = false; }

      if (!ok) return;
      const key = `${platform}|${external_id}`;
      if (existing.has(key)) { duplicates.push({ line, key, reason: 'Post já existe no dashboard' }); return; }
      if (seen.has(key)) { duplicates.push({ line, key, reason: 'Repetido no próprio arquivo' }); return; }
      seen.add(key);
      valid.push({
        id: 'imp_' + platform + '_' + external_id, platform, external_id, published_at: date, format,
        title: get('title') || '(sem título)', url: get('url') || null,
        brand_id: brand ? brand.id : (campaign ? campaign.brand_id : null), campaign_id: campaign ? campaign.id : null,
        sponsored, deliverable_id: null, metrics, source: 'import', manualFields: Object.keys(metrics).filter((k) => metrics[k] !== null),
      });
    });
    return { errors, valid, duplicates, total: parsed.rows.length };
  }

  const api = { FIELDS, parseCSV, suggestMapping, parseNumber, parseDate, parseBool, validate, norm };
  root.Importer = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
