import { useClientContext } from './ClientContext';

export function ClientSelector() {
  const { clients, current, select, isLoading } = useClientContext();
  if (isLoading) return <div className="viewer-box"><span className="viewer-hint">Carregando clientes…</span></div>;
  if (!clients.length) return null;
  return (
    <div className="viewer-box">
      <label htmlFor="client-select">Cliente</label>
      {clients.length === 1 ? (
        <strong id="client-select">{current?.name}</strong>
      ) : (
        <select id="client-select" value={current?.id ?? ''} onChange={(e) => select(e.target.value)}>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.is_demo ? ' (fictício)' : ''}</option>
          ))}
        </select>
      )}
    </div>
  );
}
