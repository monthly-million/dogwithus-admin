import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';

const emotionCache = createCache({ key: 'css', prepend: true });

import AdminLayout from './layouts/AdminLayout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import DogsPage from './pages/DogsPage';
import IntrosPage from './pages/IntrosPage';
import SignalsPage from './pages/SignalsPage';
import MatchesPage from './pages/MatchesPage';
import ChatRoomsPage from './pages/ChatRoomsPage';
import MessagesPage from './pages/MessagesPage';
import CookieTransactionsPage from './pages/CookieTransactionsPage';
import NotificationsPage from './pages/NotificationsPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import ReportsPage from './pages/ReportsPage';
import InquiriesPage from './pages/InquiriesPage';
import PurchasesPage from './pages/PurchasesPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 3,
      retry: 1,
    },
  },
});

const theme = createTheme({
  palette: {
    primary: { main: '#ff6b35' },
    background: { default: '#f8f9fa' },
  },
  typography: {
    fontFamily: '"Pretendard", "Noto Sans KR", sans-serif',
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600 },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
    },
  },
});

export default function App() {
  return (
    <CacheProvider value={emotionCache}>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <HashRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="profiles" element={<UsersPage />} />
              <Route path="dogs" element={<DogsPage />} />
              <Route path="intros" element={<IntrosPage />} />
              <Route path="signals" element={<SignalsPage />} />
              <Route path="matches" element={<MatchesPage />} />
              <Route path="chat-rooms" element={<ChatRoomsPage />} />
              <Route path="messages" element={<MessagesPage />} />
              <Route path="cookie-transactions" element={<CookieTransactionsPage />} />
              <Route path="candy-transactions" element={<Navigate to="/cookie-transactions" replace />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="announcements" element={<AnnouncementsPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="inquiries" element={<InquiriesPage />} />
              <Route path="purchases" element={<PurchasesPage />} />
              <Route path="change-password" element={<ChangePasswordPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </HashRouter>
      </ThemeProvider>
    </QueryClientProvider>
    </CacheProvider>
  );
}
