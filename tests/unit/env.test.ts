import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/lib/env';

const ok = { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'x'.repeat(40) };

describe('parseEnv', () => {
  it('aceita a configuração pública mínima', () => {
    expect(parseEnv(ok).VITE_SUPABASE_URL).toBe(ok.VITE_SUPABASE_URL);
  });
  it('recusa configuração incompleta', () => {
    expect(() => parseEnv({ VITE_SUPABASE_URL: 'http://x' })).toThrow(/Configuração incompleta/);
  });
  it('recusa segredo exposto ao navegador', () => {
    expect(() => parseEnv({ ...ok, VITE_SUPABASE_SERVICE_ROLE_KEY: 'segredo' })).toThrow(/secreta/);
  });
});
