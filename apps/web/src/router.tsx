import { createBrowserRouter } from 'react-router-dom';
import { PublicLayout } from './layouts/PublicLayout';
import { ProtectedLayout } from './layouts/ProtectedLayout';
import { AdminRoute, ParentRoute, StudentRoute } from './layouts/RouteGuards';
import { ClassesPage } from './pages/ClassesPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import AdminDashboard from './pages/AdminDashboard';
import PortalDashboard from './pages/PortalDashboard';
import NotFoundPage from './pages/NotFoundPage';

/**
 * Route structure:
 * - Public routes: no auth required, wrapped in PublicLayout
 * - Protected routes: auth required, wrapped in ProtectedLayout
 * - Role-based routes: AdminRoute, ParentRoute, StudentRoute guard specific dashboards
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

  // PROTECTED ROUTES (auth required) — flattened, each with layout + guard
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
