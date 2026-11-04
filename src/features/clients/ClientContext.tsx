import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useClients } from './queries';
import { pickClient, type ClientOption } from './selection';

interface ClientState {
  clients: (ClientOption & { is_demo: boolean })[];
  current: ClientOption | null;
  select: (id: string) => void;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

const ClientContext = createContext<ClientState | null>(null);

export function ClientProvider({ children }: { children: ReactNode }) {
  const query = useClients();
  const [params, setParams] = useSearchParams();
  const requested = params.get('cliente');
  const clients = useMemo(() => query.data ?? [], [query.data]);
  const current = useMemo(() => pickClient(clients, requested), [clients, requested]);

  const value: ClientState = {
    clients,
    current,
    select: (id) => setParams((p) => { p.set('cliente', id); return p; }),
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => { void query.refetch(); },
  };
  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
}

export function useClientContext(): ClientState {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error('useClientContext fora do ClientProvider');
  return ctx;
}
