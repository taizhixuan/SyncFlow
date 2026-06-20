import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from '@/features/auth/pages/login-page';
import { SignupPage } from '@/features/auth/pages/signup-page';
import { BoardPage } from '@/features/canvas/pages/board-page';
import { InviteAcceptPage } from '@/features/boards/pages/invite-accept-page';
import { LandingPage } from './landing-page';
import { DashboardPage } from './dashboard-page';
import { ProtectedRoute } from './protected-route';

export function AppRouter(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      {/* The "local" scratch board is a guest-accessible try-it canvas: purely
          client-side (no account, no sync), so the landing "Try the canvas" CTA
          works for logged-out visitors. Static path is matched before the param. */}
      <Route path="/app/board/local" element={<BoardPage />} />
      <Route
        path="/app/board/:boardId"
        element={
          <ProtectedRoute>
            <BoardPage />
          </ProtectedRoute>
        }
      />
      <Route path="/invite/:token" element={<InviteAcceptPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
