import { useState, type ReactNode } from 'react';
import { EmptyState } from '../../components/States';
import { useAccess } from '../clients/queries';
import { errorMessage } from './queries';

/** Mensagem de sucesso/erro das ações administrativas. */
export function useFeedback() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return {
    node: msg && <p className={msg.ok ? 'form-notice' : 'form-error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>,
    ok: (text: string) => setMsg({ ok: true, text }),
    fail: async (err: unknown) => setMsg({ ok: false, text: await errorMessage(err) }),
    failText: (text: string) => setMsg({ ok: false, text }),
    clear: () => setMsg(null),
  };
}

/** Botão de ação destrutiva com confirmação em dois passos, sem diálogo do navegador. */
export function ConfirmButton({ label, confirmLabel, onConfirm, disabled }: {
  label: string; confirmLabel: string; onConfirm: () => void; disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button className="btn btn-sm" type="button" disabled={disabled} onClick={() => setAsking(true)}>{label}</button>;
  return (
    <span className="confirm-inline">
      <button className="btn btn-sm btn-danger" type="button" onClick={() => { setAsking(false); onConfirm(); }}>{confirmLabel}</button>
      <button className="btn btn-sm" type="button" onClick={() => setAsking(false)}>Cancelar</button>
    </span>
  );
}

/** Só administradores da agência veem as telas de gestão. A permissão real está no banco (RLS). */
export function AdminOnly({ children }: { children: (orgId: string) => ReactNode }) {
  const access = useAccess();
  if (access.isLoading) return null;
  if (access.data?.kind !== 'org_admin' || !access.data.organizationId) {
    return <EmptyState title="Área restrita">Só administradores da agência gerenciam clientes e pessoas.</EmptyState>;
  }
  return <>{children(access.data.organizationId)}</>;
}
