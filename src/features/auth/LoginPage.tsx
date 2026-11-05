import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase/client';
import { AuthCard } from './AuthCard';
import { useAuth } from './AuthProvider';
import { authErrorMessage } from './messages';

export function LoginPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (session) return <Navigate to={from} replace />;

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) return setError(authErrorMessage(err));
    navigate(from, { replace: true });
  }

  async function onReset(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setBusy(false);
    if (err && err.status === 429) return setError(authErrorMessage(err));
    // Mesma resposta exista ou não o e-mail, para não revelar quem tem acesso.
    setNotice('Se este e-mail tiver acesso ao painel, você vai receber um link para criar uma nova senha.');
  }

  if (mode === 'reset') {
    return (
      <AuthCard title="Recuperar acesso">
        <form className="auth-form" onSubmit={onReset}>
          <label>
            <span>E-mail</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {notice && <p className="form-notice" role="status">{notice}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar link'}</button>
          <button className="btn" type="button" onClick={() => { setMode('login'); setNotice(''); setError(''); }}>Voltar para o login</button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Entrar">
      <form className="auth-form" onSubmit={onLogin}>
        <label>
          <span>E-mail</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          <span>Senha</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        <button className="btn" type="button" onClick={() => { setMode('reset'); setError(''); }}>Esqueci minha senha</button>
      </form>
      <p className="auth-hint">O acesso é criado pela agência. Não há cadastro aberto.</p>
    </AuthCard>
  );
}
