import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '../features/auth/AuthProvider';
import { LoginPage } from '../features/auth/LoginPage';
import { RequireAuth } from '../features/auth/RequireAuth';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { ClientProvider } from '../features/clients/ClientContext';
import { OverviewPage } from '../features/home/OverviewPage';
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
    children: [{ index: true, element: <OverviewPage /> }],
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
