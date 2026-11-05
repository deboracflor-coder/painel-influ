import { useIsFetching } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { useClientContext } from '../features/clients/ClientContext';
import { ClientSelector } from '../features/clients/ClientSelector';
import { ACCESS_LABEL, useAccess } from '../features/clients/queries';
import { REFRESH_MS } from './queryClient';

function useLastRefresh(): Date | null {
  const fetching = useIsFetching();
  const [last, setLast] = useState<Date | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- registra o fim de cada atualização
    if (fetching === 0) setLast(new Date());
  }, [fetching]);
  return last;
}

export function AppLayout() {
  const { session, signOut } = useAuth();
  const access = useAccess();
  const { current, clients } = useClientContext();
  const isDemo = !!clients.find((c) => c.id === current?.id)?.is_demo;
  const { search, pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const last = useLastRefresh();

  // fecha o menu lateral (celular) ao navegar
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMenuOpen(false), [pathname, search]);

  const kind = access.data?.kind ?? 'none';
  const isAgency = kind === 'org_admin' || kind === 'org_analyst';
  const adminPage = /^\/(clientes|pessoas|monitoramento)/.test(pathname);
  return (
    <div className="shell">
      <aside className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="Navegação">
        <div className="brandmark">
          <span className="brandmark-star" aria-hidden="true">✦</span>
          <div>
            <div className="brandmark-name">Painel Influ</div>
            <div className="brandmark-sub">{access.data?.organizationName ?? ACCESS_LABEL[kind]}</div>
          </div>
        </div>
        <nav>
          <div className="nav-group">Acompanhar</div>
          <NavLink className="nav-link" to={{ pathname: '/', search }} end>Visão executiva</NavLink>
          <NavLink className="nav-link" to={{ pathname: '/redes', search }}>Por rede</NavLink>
          <NavLink className="nav-link" to={{ pathname: '/publicacoes', search }}>Publicações</NavLink>
          <NavLink className="nav-link" to={{ pathname: '/relatorio', search }}>Relatório</NavLink>
          {isAgency && <>
            <div className="nav-group">Agência</div>
            <NavLink className="nav-link" to={{ pathname: '/contas', search }}>Contas conectadas</NavLink>
            <NavLink className="nav-link" to={{ pathname: '/historico', search }}>Histórico de coleta</NavLink>
            <NavLink className="nav-link" to={{ pathname: '/monitoramento', search }}>Monitoramento</NavLink>
            <NavLink className="nav-link" to={{ pathname: '/importacao', search }}>Importação manual</NavLink>
            {kind === 'org_admin' && <>
              <NavLink className="nav-link" to={{ pathname: '/clientes', search }}>Clientes</NavLink>
              <NavLink className="nav-link" to={{ pathname: '/pessoas', search }}>Pessoas</NavLink>
            </>}
          </>}
        </nav>
        <ClientSelector />
        <div className="user-box">
          <span className="user-email" title={session?.user.email}>{session?.user.email}</span>
          <span className="viewer-hint">{ACCESS_LABEL[kind]}</span>
          <button className="btn btn-sm" type="button" onClick={() => void signOut()}>Sair</button>
        </div>
      </aside>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" type="button" aria-label="Abrir menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>☰</button>
          <div className="topbar-title">
            <h1>{adminPage ? (pathname.startsWith('/clientes') ? 'Clientes' : pathname.startsWith('/monitoramento') ? 'Monitoramento' : 'Pessoas') : current?.name ?? 'Visão executiva'}</h1>
            {isDemo && !adminPage && <span className="badge badge-demo" title="Cliente de demonstração: nada aqui é dado real">Dados fictícios</span>}
            <div className="topbar-meta">
              <span>A tela se atualiza a cada {REFRESH_MS / 1000} s{last ? ` · última às ${last.toLocaleTimeString('pt-BR')}` : ''}</span>
              <span>A coleta nas redes segue a agenda de cada conta</span>
            </div>
          </div>
        </header>
        <main className="view" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
