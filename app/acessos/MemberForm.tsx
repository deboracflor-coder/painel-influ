'use client';
import { useActionState, useState } from 'react';
import { addMember } from './actions';

export function MemberForm({ brands }: { brands: { id: string; name: string }[] }) {
  const [s, act, pending] = useActionState(addMember, null);
  const [role, setRole] = useState('brand_viewer');
  return (
    <form action={act}>
      {s && <p className={`notice ${s.ok ? '' : 'notice-bad'}`} role="status">{s.msg}</p>}
      <div className="form-grid">
        <label>E-mail<input name="email" type="email" required /></label>
        <label>Perfil
          <select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="brand_viewer">Portal da marca (vê só a própria parceria)</option>
            <option value="viewer">Equipe · somente leitura</option>
            <option value="analyst">Equipe · análise (edita)</option>
          </select>
        </label>
        {role === 'brand_viewer' && (
          <label>Marca<select name="brand_id" required><option value="">Escolha</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        )}
        <button className="btn btn-primary" disabled={pending}>Liberar acesso</button>
      </div>
    </form>
  );
}
