import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { AdminRoute, ParentRoute, StudentRoute } from './layouts/RouteGuards';
import { ClassesPage } from './pages/ClassesPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import DashboardRedirectPage from './pages/DashboardRedirectPage';
import AdminDashboard from './pages/AdminDashboard';
import PeoplePage from './pages/PeoplePage';
import FamiliesPage from './pages/FamiliesPage';
import BillingPage from './pages/BillingPage';
import StripeSettingsPage from './pages/StripeSettingsPage';
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
  // SMART ROUTES (adapts to auth status — public navbar when unauthenticated, protected navbar when authenticated)
  {
    path: '/',
    element: <AppLayout><ClassesPage /></AppLayout>,
  },
  {
    path: '/classes',
    element: <AppLayout><ClassesPage /></AppLayout>,
  },
  {
    path: '/login',
    element: <AppLayout><LoginPage /></AppLayout>,
  },
  {
    path: '/signup',
    element: <AppLayout><SignupPage /></AppLayout>,
  },
  {
    path: '/enrol',
    element: <AppLayout><ClassesPage /></AppLayout>, // Placeholder, replaced in Phase 1C.3
  },

  // AUTH CALLBACK (handles magic link redirect)
  {
    path: '/auth/callback',
    element: <AppLayout><AuthCallbackPage /></AppLayout>,
  },

  // DASHBOARD REDIRECT (smart redirect based on user role)
  {
    path: '/dashboard',
    element: <AppLayout><DashboardRedirectPage /></AppLayout>,
  },

  // PROTECTED ROUTES (auth required) — flattened, each with layout + guard

  // ADMIN ROUTES
  {
    path: '/admin/people',
    element: <AppLayout><AdminRoute><PeoplePage /></AdminRoute></AppLayout>,
  },
  {
    path: '/admin/families',
    element: <AppLayout><AdminRoute><FamiliesPage /></AdminRoute></AppLayout>,
  },
  {
    path: '/admin/setup',
    element: <AppLayout><AdminRoute><AdminDashboard /></AdminRoute></AppLayout>,
  },
  {
    path: '/admin/setup/billing',
    element: <AppLayout><AdminRoute><BillingPage /></AdminRoute></AppLayout>,
  },
  {
    path: '/admin/setup/levels',
    element: <AppLayout><AdminRoute><LevelsPage /></AdminRoute></AppLayout>,
  },
  {
    path: '/admin/setup/terms',
    element: <AppLayout><AdminRoute><TermsPage /></AdminRoute></AppLayout>,
  },
  {
    path: '/admin/setup/stripe',
    element: <AppLayout><AdminRoute><StripeSettingsPage /></AdminRoute></AppLayout>,
  },

  // LEGACY ROUTES (Phase 1B) — kept for backward compatibility
  {
    path: '/dashboard/admin',
    element: <AppLayout><AdminRoute><AdminDashboard /></AdminRoute></AppLayout>,
  },
  {
    path: '/dashboard/portal',
    element: <AppLayout><ParentRoute><PortalDashboard /></ParentRoute></AppLayout>,
  },
  {
    path: '/dashboard/student',
    element: <AppLayout><StudentRoute><PortalDashboard /></StudentRoute></AppLayout>,
  },

  // 404
  {
    path: '*',
    element: <AppLayout><NotFoundPage /></AppLayout>,
  },
]);

export default router;
