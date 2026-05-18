import { createBrowserRouter } from 'react-router-dom';
import { PublicLayout } from './layouts/PublicLayout';
import { ProtectedLayout } from './layouts/ProtectedLayout';
import { AdminRoute, ParentRoute, StudentRoute } from './layouts/RouteGuards';
import { ClassesPage } from './pages/ClassesPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import AdminDashboard from './pages/AdminDashboard';
import PeoplePage from './pages/PeoplePage';
import FamiliesPage from './pages/FamiliesPage';
import BillingPage from './pages/BillingPage';
import LevelsPage from './pages/LevelsPage';
import TermsPage from './pages/TermsPage';
import PortalDashboard from './pages/PortalDashboard';
import NotFoundPage from './pages/NotFoundPage';

/**
 * Route structure:
 * - Public routes: no auth required, wrapped in PublicLayout
 * - Auth callback: /auth/callback (magic link redirect)
 * - Protected routes: auth required, wrapped in ProtectedLayout
 * - Role-based routes: AdminRoute, TeacherRoute, ParentRoute, StudentRoute
 *
 * Phase 1C routes:
 * - /admin/people (AdminRoute)
 * - /admin/setup (AdminRoute) — terms, levels, classes, requirements
 * - /portal/* (ParentRoute) — parent portal (Phase 1G)
 */

const router = createBrowserRouter([
  // PUBLIC ROUTES (no auth required)
  {
    path: '/',
    element: <PublicLayout><ClassesPage /></PublicLayout>,
  },
  {
    path: '/classes',
    element: <PublicLayout><ClassesPage /></PublicLayout>,
  },
  {
    path: '/login',
    element: <PublicLayout><LoginPage /></PublicLayout>,
  },
  {
    path: '/signup',
    element: <PublicLayout><SignupPage /></PublicLayout>,
  },
  {
    path: '/enrol',
    element: <PublicLayout><ClassesPage /></PublicLayout>, // Placeholder, replaced in Phase 1C.3
  },

  // AUTH CALLBACK (handles magic link redirect)
  {
    path: '/auth/callback',
    element: <AuthCallbackPage />,
  },

  // PROTECTED ROUTES (auth required) — flattened, each with layout + guard

  // ADMIN ROUTES
  {
    path: '/admin/people',
    element: (
      <ProtectedLayout>
        <AdminRoute>
          <PeoplePage />
        </AdminRoute>
      </ProtectedLayout>
    ),
  },
  {
    path: '/admin/families',
    element: (
      <ProtectedLayout>
        <AdminRoute>
          <FamiliesPage />
        </AdminRoute>
      </ProtectedLayout>
    ),
  },
  {
    path: '/admin/setup',
    element: (
      <ProtectedLayout>
        <AdminRoute>
          <AdminDashboard />
        </AdminRoute>
      </ProtectedLayout>
    ),
  },
  {
    path: '/admin/setup/billing',
    element: (
      <ProtectedLayout>
        <AdminRoute>
          <BillingPage />
        </AdminRoute>
      </ProtectedLayout>
    ),
  },
  {
    path: '/admin/setup/levels',
    element: (
      <ProtectedLayout>
        <AdminRoute>
          <LevelsPage />
        </AdminRoute>
      </ProtectedLayout>
    ),
  },
  {
    path: '/admin/setup/terms',
    element: (
      <ProtectedLayout>
        <AdminRoute>
          <TermsPage />
        </AdminRoute>
      </ProtectedLayout>
    ),
  },

  // LEGACY ROUTES (Phase 1B) — kept for backward compatibility
  {
    path: '/dashboard/admin',
    element: (
      <ProtectedLayout>
        <AdminRoute>
          <AdminDashboard />
        </AdminRoute>
      </ProtectedLayout>
    ),
  },
  {
    path: '/dashboard/portal',
    element: (
      <ProtectedLayout>
        <ParentRoute>
          <PortalDashboard />
        </ParentRoute>
      </ProtectedLayout>
    ),
  },
  {
    path: '/dashboard/student',
    element: (
      <ProtectedLayout>
        <StudentRoute>
          <PortalDashboard />
        </StudentRoute>
      </ProtectedLayout>
    ),
  },

  // 404
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);

export default router;
