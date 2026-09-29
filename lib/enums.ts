export const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'facebook', 'linkedin'] as const;
export const FORMATS = ['reels', 'story', 'carousel', 'photo', 'video', 'short', 'long_video', 'live', 'text', 'other'] as const;
export const DELIVERY_STATUS = ['planejado', 'em_producao', 'aguardando_aprovacao', 'publicado', 'entregue', 'pendente', 'cancelado'] as const;
export const EMV_BASIS = ['impressions', 'views', 'reach', 'engagements'] as const;
export const ROLES = ['owner', 'analyst', 'viewer', 'brand_viewer'] as const;

export const isOneOf = <T extends readonly string[]>(list: T, v: unknown): v is T[number] => typeof v === 'string' && (list as readonly string[]).includes(v);
export const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
export const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
