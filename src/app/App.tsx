import { QueryClientProvider } from '@tanstack/react-query';
import { lazy } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '../features/auth/AuthProvider';
import { LoginPage } from '../features/auth/LoginPage';
import { RequireAuth } from '../features/auth/RequireAuth';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { ClientProvider } from '../features/clients/ClientContext';
import { ExecutivePage } from '../features/dashboard/ExecutivePage';
import { AppLayout } from './AppLayout';
import { queryClient } from './queryClient';

// Telas carregadas sob demanda: o primeiro acesso baixa só login, layout e visão executiva.
const AccountsPage = lazy(() => import('../features/accounts/AccountsPage').then((m) => ({ default: m.AccountsPage })));
const ReportPage = lazy(() => import('../features/report/ReportPage').then((m) => ({ default: m.ReportPage })));
const MonitoringPage = lazy(() => import('../features/monitoring/MonitoringPage').then((m) => ({ default: m.MonitoringPage })));
const ImportPage = lazy(() => import('../features/import/ImportPage').then((m) => ({ default: m.ImportPage })));
const ClientsPage = lazy(() => import('../features/admin/ClientsPage').then((m) => ({ default: m.ClientsPage })));
const PeoplePage = lazy(() => import('../features/admin/PeoplePage').then((m) => ({ default: m.PeoplePage })));
const ContentPage = lazy(() => import('../features/dashboard/ContentPage').then((m) => ({ default: m.ContentPage })));
const NetworkPage = lazy(() => import('../features/dashboard/NetworkPage').then((m) => ({ default: m.NetworkPage })));
const SyncHistoryPage = lazy(() => import('../features/sync/SyncHistoryPage').then((m) => ({ default: m.SyncHistoryPage })));

const router = createBrowserRouter([
  { path: '/entrar', element: <LoginPage /> },
  { path: '/redefinir-senha', element: <ResetPasswordPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <ClientProvider>
          <AppLayout />
        </ClientProvider>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <ExecutivePage /> },
      { path: 'redes', element: <NetworkPage /> },
      { path: 'redes/:platform', element: <NetworkPage /> },
      { path: 'publicacoes', element: <ContentPage /> },
      { path: 'relatorio', element: <ReportPage /> },
      { path: 'historico', element: <SyncHistoryPage /> },
      { path: 'contas', element: <AccountsPage /> },
      { path: 'monitoramento', element: <MonitoringPage /> },
      { path: 'importacao', element: <ImportPage /> },
      { path: 'clientes', element: <ClientsPage /> },
      { path: 'pessoas', element: <PeoplePage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
