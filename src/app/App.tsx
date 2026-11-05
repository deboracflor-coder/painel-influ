import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '../features/auth/AuthProvider';
import { LoginPage } from '../features/auth/LoginPage';
import { RequireAuth } from '../features/auth/RequireAuth';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { ClientProvider } from '../features/clients/ClientContext';
import { ClientsPage } from '../features/admin/ClientsPage';
import { PeoplePage } from '../features/admin/PeoplePage';
import { ContentPage } from '../features/dashboard/ContentPage';
import { ExecutivePage } from '../features/dashboard/ExecutivePage';
import { NetworkPage } from '../features/dashboard/NetworkPage';
import { SyncHistoryPage } from '../features/sync/SyncHistoryPage';
import { AppLayout } from './AppLayout';
import { queryClient } from './queryClient';

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
      { path: 'historico', element: <SyncHistoryPage /> },
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
