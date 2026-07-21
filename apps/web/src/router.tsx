import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { AdminRoute, ParentRoute, StudentRoute, SuperAdminRoute } from "./layouts/RouteGuards";
import { LabelsProvider } from "./contexts/LabelsContext";
import { ClassesPage } from "./pages/ClassesPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import CreateStudioPage from '@/pages/CreateStudioPage';
import SessionHandoffPage from '@/pages/auth/SessionHandoffPage';
import DashboardRedirectPage from "./pages/DashboardRedirectPage";
import AdminDashboard from "./pages/AdminDashboard";
import StudentsPage from "./pages/StudentsPage";
import FamiliesPage from "./pages/FamiliesPage";
import NotificationsPage from "./pages/NotificationsPage";
import FamilyDetailPage from "./pages/FamilyDetailPage";
import BillingPage from "./pages/BillingPage";
import StripeSettingsPage from "./pages/StripeSettingsPage";
import BundledPaymentsSettingsPage from "./pages/BundledPaymentsSettingsPage";
import PaymentSettingsPage from "./pages/PaymentSettingsPage";
import InvoicingSettingsPage from "./pages/InvoicingSettingsPage";
import TenantSettingsPage from "./pages/TenantSettingsPage";
import PlatformOnboardPage from "./pages/PlatformOnboardPage";
import PlatformFeaturesPage from "./pages/PlatformFeaturesPage";
import FinanceWalkthroughPage from "./pages/FinanceWalkthroughPage";
import LevelsPage from "./pages/LevelsPage";
import TermsPage from "./pages/TermsPage";
import AdminClassesPage from "./pages/AdminClassesPage";
import AdminAppointmentsPage from "./pages/AdminAppointmentsPage";
import BookingSettingsPage from "./pages/BookingSettingsPage";
import BookingServicesPage from "./pages/BookingServicesPage";
import GoogleCalendarCallbackPage from "./pages/GoogleCalendarCallbackPage";
import WaiversPage from "./pages/WaiversPage";
import BookingPage from "./pages/BookingPage";
import PortalDashboard from "./pages/PortalDashboard";
import EnrolPage from "./pages/EnrolPage";
import EnrolPayPage from "./pages/EnrolPayPage";
import EnrolCompletePage from "./pages/EnrolCompletePage";
import NotFoundPage from "./pages/NotFoundPage";
import FinanceHubPage from "./pages/FinanceHubPage";
import PaymentsLogPage from "./pages/PaymentsLogPage";
import ExpensesPage from "./pages/ExpensesPage";
import ExpenseCategoriesPage from "./pages/ExpenseCategoriesPage";
import { LanguageProvider } from "./contexts/LanguageContext";

function RootLayout() {
  return (
    <LanguageProvider>
      <LabelsProvider>
        <AppLayout>
          <Outlet />
        </AppLayout>
      </LabelsProvider>
    </LanguageProvider>
  );
}

const router = createBrowserRouter([
  {
    path: '/auth/callback',
    element: (
      <LanguageProvider>
        <AuthCallbackPage />
      </LanguageProvider>
    ),
  },
  // Self-serve studio signup. Disabled by default: it provisions a tenant with no
  // payment gate, and provision_tenant is granted to service_role only. Paid signup
  // provisions server-side from the payment webhook (SPEC §7). Set
  // VITE_ENABLE_SELF_SERVE_SIGNUP=true (and re-grant the RPC) to use the wizard.
  {
    path: '/create-studio',
    element:
      import.meta.env.VITE_ENABLE_SELF_SERVE_SIGNUP === 'true' ? (
        <CreateStudioPage />
      ) : (
        <Navigate to="/login" replace />
      ),
  },
  {
    path: '/auth/session-handoff',
    element: <SessionHandoffPage />,
  },
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <ClassesPage /> },
      { path: 'classes', element: <ClassesPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'signup', element: <SignupPage /> },
      { path: 'enrol', element: <EnrolPage /> },
      { path: 'enrol/pay/:engagementId', element: <EnrolPayPage /> },
      { path: 'enrol/complete', element: <EnrolCompletePage /> },
      { path: 'book', element: <BookingPage /> },
      { path: 'book/:offeringId', element: <BookingPage /> },
      { path: 'dashboard', element: <DashboardRedirectPage /> },

      // ADMIN ROUTES
      { path: "admin/students", element: <AdminRoute><StudentsPage /></AdminRoute> },
      // Legacy redirects — keep URLs working
      { path: "admin/people", element: <AdminRoute><Navigate to="/admin/students" replace /></AdminRoute> },
      { path: "admin/families", element: <AdminRoute><FamiliesPage /></AdminRoute> },
      { path: "admin/notifications", element: <AdminRoute><NotificationsPage /></AdminRoute> },
      { path: "admin/appointments", element: <AdminRoute><AdminAppointmentsPage /></AdminRoute> },
      { path: "admin/families/:id", element: <AdminRoute><FamilyDetailPage /></AdminRoute> },
      { path: "admin/finance", element: <AdminRoute><FinanceHubPage /></AdminRoute> },
      { path: "admin/finance/payments", element: <AdminRoute><PaymentsLogPage /></AdminRoute> },
      { path: "admin/finance/expenses", element: <AdminRoute><ExpensesPage /></AdminRoute> },
      { path: "admin/finance/expenses/categories", element: <AdminRoute><ExpenseCategoriesPage /></AdminRoute> },
      { path: "admin/setup", element: <AdminRoute><AdminDashboard /></AdminRoute> },
      { path: "admin/setup/billing", element: <AdminRoute><BillingPage /></AdminRoute> },
      { path: "admin/setup/levels", element: <AdminRoute><LevelsPage /></AdminRoute> },
      { path: "admin/setup/terms", element: <AdminRoute><TermsPage /></AdminRoute> },
      { path: "admin/setup/classes", element: <AdminRoute><AdminClassesPage /></AdminRoute> },
      // Legacy redirect — the admin-only calendar was removed in favour of the
      // client-facing classes calendar on /classes.
      { path: "admin/setup/calendar", element: <AdminRoute><Navigate to="/classes" replace /></AdminRoute> },
      { path: "admin/setup/booking", element: <AdminRoute><BookingSettingsPage /></AdminRoute> },
      { path: "admin/setup/services", element: <AdminRoute><BookingServicesPage /></AdminRoute> },
      { path: "admin/setup/integrations/google/callback", element: <AdminRoute><GoogleCalendarCallbackPage /></AdminRoute> },
      { path: "admin/setup/settings", element: <AdminRoute><TenantSettingsPage /></AdminRoute> },
      { path: "admin/setup/tax", element: <AdminRoute><Navigate to="/admin/setup/classes" replace /></AdminRoute> },
      { path: "admin/setup/stripe", element: <AdminRoute><StripeSettingsPage /></AdminRoute> },
      { path: "admin/setup/bundled-payments", element: <AdminRoute><BundledPaymentsSettingsPage /></AdminRoute> },
      { path: "admin/setup/grow", element: <AdminRoute><Navigate to="/admin/setup/bundled-payments" replace /></AdminRoute> },
      { path: "admin/setup/icount", element: <AdminRoute><Navigate to="/admin/setup/bundled-payments" replace /></AdminRoute> },
      { path: "admin/setup/payments", element: <AdminRoute><PaymentSettingsPage /></AdminRoute> },
      { path: "admin/setup/invoicing", element: <AdminRoute><InvoicingSettingsPage /></AdminRoute> },
      { path: "admin/setup/waivers", element: <AdminRoute><WaiversPage /></AdminRoute> },
      { path: "admin/dev/finance-walkthrough", element: <AdminRoute><FinanceWalkthroughPage /></AdminRoute> },
      { path: "platform/onboard", element: <SuperAdminRoute><PlatformOnboardPage /></SuperAdminRoute> },
      { path: "platform/features", element: <SuperAdminRoute><PlatformFeaturesPage /></SuperAdminRoute> },

      // LEGACY ROUTES (Phase 1B) — kept for backward compatibility
      { path: "dashboard/admin", element: <AdminRoute><AdminDashboard /></AdminRoute> },
      { path: "dashboard/portal", element: <ParentRoute><PortalDashboard /></ParentRoute> },
      { path: "dashboard/student", element: <StudentRoute><PortalDashboard /></StudentRoute> },

      // 404
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export default router;
