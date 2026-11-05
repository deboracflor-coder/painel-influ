import { FORMAT_LABEL, fmtDate, fmtInt, fmtPct, PLATFORM_LABEL } from '../domain/format';
import { engagement, isNum, postER, type SortKey } from '../domain/metrics';
import type { Post } from '../domain/types';
import { ManualBadge } from './Kpi';

const GLYPH: Record<string, string> = { reels: '▶', video: '▶', short: '▶', long_video: '▶', live: '●', story: '◔', carousel: '❐', photo: '▣', text: '¶', other: '◇' };

function Cell({ label, value, hl, fmt = fmtInt }: { label: string; value: number | null; hl?: boolean; fmt?: (v: number | null) => string }) {
  return <div><span>{label}</span><b className={hl ? 'hl' : undefined}>{fmt(value)}</b></div>;
}

export function ContentCard({ post, rank, highlight }: { post: Post; rank?: number; highlight?: SortKey }) {
  const m = post.metrics;
  const eng = engagement(m), er = postER(post);
  const manual = post.source === 'manual' || post.source === 'import';
  const noMetrics = post.collected_at === null;
  const title = post.caption?.trim() ? post.caption.trim().slice(0, 140) : `${FORMAT_LABEL[post.format]} sem legenda`;
  return (
    <article className="content-card">
      <div className="thumb" style={{ background: `var(--p-${post.platform})` }} aria-hidden="true">
        {post.thumbnail_url
          ? <img className="thumb-img" src={post.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
          : <span className="thumb-glyph">{GLYPH[post.format] ?? '◇'}</span>}
        {rank !== undefined && <span className="thumb-rank">{rank}º</span>}
        <span className="thumb-tag">{PLATFORM_LABEL[post.platform]} · {FORMAT_LABEL[post.format]}</span>
      </div>
      <div className="content-body">
        <div className="content-meta"><span>{fmtDate(post.published_at.slice(0, 10))}</span>{manual && <ManualBadge />}</div>
        <div className="content-title">{title}</div>
        {noMetrics && <div className="callout callout-warn"><p>Ainda sem métricas coletadas para esta publicação.</p></div>}
        <div className="metric-list">
          <Cell label="Alcance" value={m.reach} hl={highlight === 'reach'} />
          <Cell label="Views" value={m.views} hl={highlight === 'views'} />
          <Cell label="Curtidas" value={m.likes} hl={highlight === 'likes'} />
          <Cell label="Coment." value={m.comments} hl={highlight === 'comments'} />
          <Cell label="Compart." value={m.shares} hl={highlight === 'shares'} />
          <Cell label="Salvos" value={m.saves} hl={highlight === 'saves'} />
          <Cell label="Engaj." value={eng} hl={highlight === 'engagement'} />
          <Cell label="Taxa" value={er} hl={highlight === 'er'} fmt={(v) => fmtPct(v)} />
          <Cell label="Seguid." value={isNum(m.follows) ? m.follows : null} hl={highlight === 'follows'} />
        </div>
        {post.permalink && <a className="small" href={post.permalink} target="_blank" rel="noopener noreferrer">Abrir publicação ↗</a>}
      </div>
    </article>
  );
}
