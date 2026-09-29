'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) { setState('error'); setMsg(error.message); } else setState('sent');
  }

  return (
    <main className="login">
      <h1>Painel Influ</h1>
      {state === 'sent' ? (
        <p className="notice">Enviamos um link de acesso para <b>{email}</b>. Abra o e-mail neste mesmo navegador.</p>
      ) : (
        <form onSubmit={send} className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <label>E-mail
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="btn btn-primary" disabled={state === 'sending'}>{state === 'sending' ? 'Enviando…' : 'Receber link de acesso'}</button>
          {state === 'error' && <p className="notice notice-bad">Não foi possível enviar: {msg}</p>}
        </form>
      )}
    </main>
  );
}
