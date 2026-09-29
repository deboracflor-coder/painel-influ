/* Permissões e filtros globais.
   Na demo o recorte por marca acontece aqui, no navegador, para simular o portal.
   Em produção o mesmo recorte é feito no banco (RLS em backend/schema.sql),
   e o front só recebe o que o usuário pode ver. */
(function (root) {
  const Calc = root.Calc || (typeof require !== 'undefined' ? require('./calc.js') : null);

  const ROLES = {
    owner: { label: 'Equipe · administração', internal: true, edit: true },
    analyst: { label: 'Equipe · análise', internal: true, edit: true },
    viewer: { label: 'Equipe · leitura', internal: true, edit: false },
    brand: { label: 'Portal da marca', internal: false, edit: false },
  };

  function can(viewer, action) {
    const r = ROLES[viewer.role];
    if (!r) return false;
    switch (action) {
      case 'view_internal': return r.internal;              // contas, orgânicos, outras marcas, logs
      case 'edit': return r.edit;                           // contratos, parâmetros, importação
      case 'sync': return r.internal;
      case 'view_brand': return true;
      default: return false;
    }
  }

  // Recorta a base inteira ao que o usuário pode ver
  function scope(db, viewer) {
    if (can(viewer, 'view_internal')) return db;
    const b = viewer.brandId;
    if (!b) return emptyLike(db);
    const campaigns = db.campaigns.filter((c) => c.brand_id === b);
    const campIds = new Set(campaigns.map((c) => c.id));
    return {
      ...emptyLike(db),
      brands: db.brands.filter((x) => x.id === b),
      campaigns,
      financials: db.financials.filter((f) => campIds.has(f.campaign_id)),
      deliverables: db.deliverables.filter((d) => campIds.has(d.campaign_id)),
      deliveryItems: db.deliveryItems.filter((d) => campIds.has(d.campaign_id)).map(({ internal_notes, ...rest }) => rest),
      posts: db.posts.filter((p) => p.brand_id === b),
      params: db.params, // necessário para mostrar o valor estimado da própria marca
      meta: db.meta,
    };
  }
  function emptyLike(db) {
    return { accounts: [], daily: [], posts: [], brands: [], campaigns: [], financials: [], deliverables: [], deliveryItems: [], params: [], syncRuns: [], meta: db.meta };
  }

  // Filtros globais aplicados a posts
  function filterPosts(posts, f, db) {
    return posts.filter((p) => {
      if (f.start && f.end && !Calc.inPeriod(p.published_at, f.start, f.end)) return false;
      if (f.platforms && f.platforms.length && !f.platforms.includes(p.platform)) return false;
      if (f.brand && p.brand_id !== f.brand) return false;
      if (f.campaign && p.campaign_id !== f.campaign) return false;
      if (f.format && p.format !== f.format) return false;
      if (f.contentType === 'organico' && p.sponsored) return false;
      if (f.contentType === 'patrocinado' && !p.sponsored) return false;
      if (f.contentKind && contentKind(p.format) !== f.contentKind) return false;
      if (f.deliveryStatus) {
        const item = db && db.deliveryItems.find((i) => i.post_id === p.id);
        if (!item || item.status !== f.deliveryStatus) return false;
      }
      return true;
    });
  }

  // Tipo de conteúdo: vídeo x estático x efêmero
  function contentKind(format) {
    if (['reels', 'video', 'short', 'long_video', 'live'].includes(format)) return 'video';
    if (format === 'story') return 'efemero';
    return 'estatico';
  }

  const api = { ROLES, can, scope, filterPosts, contentKind };
  root.Query = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
