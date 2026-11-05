import { describe, expect, it } from 'vitest';
import { authErrorMessage } from '../../src/features/auth/messages';

describe('authErrorMessage', () => {
  it('não revela se o e-mail existe', () => {
    expect(authErrorMessage({ status: 400, message: 'Invalid login credentials' })).toBe('E-mail ou senha incorretos.');
  });
  it('avisa sobre excesso de tentativas', () => {
    expect(authErrorMessage({ status: 429 })).toMatch(/Muitas tentativas/);
  });
});
