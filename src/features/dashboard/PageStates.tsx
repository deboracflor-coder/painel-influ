import type { ReactNode } from 'react';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';

/** Estados comuns às telas de dados. Devolve null quando a tela pode ser exibida. */
export function dataGate({ isLoading, error, refetch, hasClient, hasAccounts }: {
  isLoading: boolean; error: unknown; refetch: () => void; hasClient: boolean; hasAccounts: boolean;
}): ReactNode | null {
  if (!hasClient) return <EmptyState title="Nenhum cliente liberado para você">Peça a um administrador da agência para vincular seu usuário a um cliente.</EmptyState>;
  if (isLoading) return <LoadingState label="Carregando dados…" />;
  if (error) return <ErrorState detail="Os dados não puderam ser carregados. Verifique sua conexão." action={<button className="btn" type="button" onClick={refetch}>Tentar de novo</button>} />;
  if (!hasAccounts) return <EmptyState title="Nenhuma rede conectada para este cliente">Quando uma conta for conectada e a primeira coleta terminar, os indicadores aparecem aqui. Nenhum número é exibido antes disso.</EmptyState>;
  return null;
}
