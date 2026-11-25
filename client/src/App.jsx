import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, homeFor, useAuth } from '@/auth';
import { I18nProvider, useI18n } from '@/i18n';
import { ThemeProvider } from '@/theme';
import AppNavbar from '@/components/AppNavbar';
import RagChatbot from '@/components/RagChatbot';
import { Spinner } from '@/components/shared';
import { Toaster } from '@/components/ui/sonner';
import LoginPage from '@/pages/LoginPage';

const AdminPage = lazy(() => import('@/pages/AdminPage'));
const DirectoryPage = lazy(() => import('@/pages/DirectoryPage'));
const ForensicsPage = lazy(() => import('@/pages/ForensicsPage'));
const JourneyPage = lazy(() => import('@/pages/JourneyPage'));
const PathwaysPage = lazy(() => import('@/pages/PathwaysPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));

function Shell() {
  const { user } = useAuth();
  const { t } = useI18n();
  if (!user) return <LoginPage />;

  const home = homeFor(user.role);
  return (
    <div className="min-h-svh bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2">
        {t('skip')}
      </a>
      <AppNavbar />
      {/* Keyed by user so a role switch remounts pages with correctly scoped data. */}
      <main id="main" className="mx-auto max-w-[1320px] px-4 pt-7 pb-10 sm:px-8 sm:pt-9 lg:px-12" key={user.id}>
        <Suspense fallback={<div className="flex justify-center py-16"><Spinner className="size-6" /></div>}>
          <Routes>
            <Route path="/forensics" element={<ForensicsPage />} />
            <Route path="/pathways" element={<PathwaysPage />} />
            <Route path="/journey" element={<JourneyPage />} />
            <Route path="/directory" element={<DirectoryPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/admin" element={user.role === 'admin' ? <AdminPage /> : <Navigate to={home} replace />} />
            <Route path="*" element={<Navigate to={home} replace />} />
          </Routes>
        </Suspense>
      </main>
      <footer className="mx-auto max-w-[1320px] px-4 pt-6 pb-28 text-center text-[11.5px] text-muted-foreground sm:px-8 lg:px-12">
        {t('footer.text')}
      </footer>
      <RagChatbot key={`chat-${user.id}`} />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
    <I18nProvider>
      {/* The router wraps auth so login and logout can reset the URL. */}
      <BrowserRouter>
        <AuthProvider>
          <Shell />
          <Toaster position="bottom-left" richColors closeButton visibleToasts={2} />
        </AuthProvider>
      </BrowserRouter>
    </I18nProvider>
    </ThemeProvider>
  );
}
