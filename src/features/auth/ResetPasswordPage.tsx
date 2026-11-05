import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase/client';
import { LoadingState } from '../../components/States';
import { AuthCard } from './AuthCard';
import { useAuth } from './AuthProvider';
import { authErrorMessage } from './messages';

export const MIN_PASSWORD = 10;

export function ResetPasswordPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (loading) return <LoadingState label="Validando o link…" />;
  if (!session) return <Navigate to="/entrar" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setError(`A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);
    if (password !== confirm) return setError('As senhas não conferem.');
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(authErrorMessage(err));
    navigate('/', { replace: true });
  }

  return (
    <AuthCard title="Criar nova senha">
      <form className="auth-form" onSubmit={onSubmit}>
        <label>
          <span>Nova senha</span>
          <input type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label>
          <span>Repita a senha</span>
          <input type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar senha'}</button>
      </form>
    </AuthCard>
  );
}
