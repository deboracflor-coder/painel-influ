import { QueryClient } from '@tanstack/react-query';

/** Atualização visual da tela. Não tem relação com a frequência de coleta nas APIs. */
export const REFRESH_MS = 60_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: REFRESH_MS,
      refetchIntervalInBackground: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
});
