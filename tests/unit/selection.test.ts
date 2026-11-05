import { describe, expect, it } from 'vitest';
import { pickClient } from '../../src/features/clients/selection';

const list = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];

describe('pickClient', () => {
  it('usa o cliente pedido na URL quando a pessoa tem acesso', () => {
    expect(pickClient(list, 'b')?.id).toBe('b');
  });
  it('ignora um id ao qual a pessoa não tem acesso', () => {
    expect(pickClient(list, 'outro-cliente')?.id).toBe('a');
  });
  it('sem nada pedido, abre o primeiro', () => {
    expect(pickClient(list, null)?.id).toBe('a');
  });
  it('sem clientes liberados, não escolhe nenhum', () => {
    expect(pickClient([], 'a')).toBeNull();
  });
});
