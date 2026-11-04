export interface ClientOption {
  id: string;
  name: string;
}

/**
 * Escolhe o cliente ativo: o pedido na URL, se a pessoa tiver acesso a ele;
 * senão o primeiro da lista. Um id sem acesso nunca é aceito.
 */
export function pickClient(clients: ClientOption[], requested: string | null): ClientOption | null {
  if (requested) {
    const found = clients.find((c) => c.id === requested);
    if (found) return found;
  }
  return clients[0] ?? null;
}
