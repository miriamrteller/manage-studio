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
import { EnrolEntryRoute } from "./layouts/EnrolEntryRoute";
import EnrolPayPage from "./pages/EnrolPayPage";
import EnrolCompletePage from "./pages/EnrolCompletePage";
import PayRequestPage from "./pages/PayRequestPage";
import NotFoundPage from "./pages/NotFoundPage";
import { StudioHostGate } from "./layouts/StudioHostGate";
import FinanceHubPage from "./pages/FinanceHubPage";
import PaymentsLogPage from "./pages/PaymentsLogPage";
import ExpensesPage from "./pages/ExpensesPage";
import ExpenseCategoriesPage from "./pages/ExpenseCategoriesPage";
import LeadsPage from "./pages/LeadsPage";
import JobsPage from "./pages/JobsPage";
import JobDetailPage from "./pages/JobDetailPage";
import InquirePage from "./pages/InquirePage";
import EmbedInquirePage, { EmbedNamedFormPage } from "./pages/EmbedInquirePage";
import NamedFormPage from "./pages/NamedFormPage";
import LeadFormsPage from "./pages/LeadFormsPage";
import AdminQuotesPage from "./pages/AdminQuotesPage";
import AdminQuoteEditorPage from "./pages/AdminQuoteEditorPage";
import QuotePage from "./pages/QuotePage";
import LegalPage from "./pages/LegalPage";
import UnsubscribePage from "./pages/UnsubscribePage";
import { LanguageProvider } from "./contexts/LanguageContext";
import { RouteErrorFallback } from "./components/RouteErrorFallback";
import { MonitoringContextSync } from "./lib/monitoring/MonitoringContextSync";

function RootLayout() {
  return (
    <LanguageProvider>
      <StudioHostGate>
        <LabelsProvider>
          <AppLayout>
            <MonitoringContextSync />
            <Outlet />
          </AppLayout>
        </LabelsProvider>
      </StudioHostGate>
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
  // Self-serve studio signup (free beta) on app.opalswift.com. Off unless
  // VITE_ENABLE_SELF_SERVE_SIGNUP=true (the page then redirects to /login); the
  // provision-studio function has its own switch, SELF_SERVE_SIGNUP_ENABLED.
  {
    path: '/create-studio',
    element: (
      <LanguageProvider>
        <CreateStudioPage />
      </LanguageProvider>
    ),
  },
  // Enquiry form for an iframe on the studio's own site: no app chrome. The
  // only framable path (public/_headers, /embed/*).
  {
    path: '/embed/inquire',
    element: <EmbedInquirePage />,
    errorElement: <RouteErrorFallback />,
  },
  {
    path: '/embed/f/:slug',
    element: <EmbedNamedFormPage />,
    errorElement: <RouteErrorFallback />,
  },
  {
    path: '/auth/session-handoff',
    element: <SessionHandoffPage />,
  },
  {
    path: '/',
    element: <RootLayout />,
    // Last-resort fallback if RootLayout itself throws (renders without the layout).
    errorElement: <RouteErrorFallback />,
    children: [
      {
        // Pathless wrapper: a page that throws during render is replaced by the
        // fallback inside RootLayout's outlet, so the header and nav keep working.
        errorElement: <RouteErrorFallback />,
        children: [
          { index: true, element: <ClassesPage /> },
          { path: 'classes', element: <ClassesPage /> },
          { path: 'login', element: <LoginPage /> },
          { path: 'signup', element: <SignupPage /> },
          { path: 'enrol', element: <EnrolEntryRoute /> },
          { path: 'enrol/pay/:engagementId', element: <EnrolPayPage /> },
          { path: 'enrol/complete', element: <EnrolCompletePage /> },
          // Public pay link for a job (shoot) deposit/balance request — token is the capability.
          { path: 'pay/:token', element: <PayRequestPage /> },
          { path: 'book', element: <BookingPage /> },
          { path: 'book/:offeringId', element: <BookingPage /> },
          { path: 'inquire', element: <InquirePage /> },
          { path: 'f/:slug', element: <NamedFormPage /> },
          { path: 'quote/:token', element: <QuotePage /> },
          { path: 'legal/:doc', element: <LegalPage /> },
          { path: 'unsubscribe/:token', element: <UnsubscribePage /> },
          { path: 'dashboard', element: <DashboardRedirectPage /> },

          // ADMIN ROUTES
          { path: "admin/students", element: <AdminRoute><StudentsPage /></AdminRoute> },
          // Legacy redirects — keep URLs working
          { path: "admin/people", element: <AdminRoute><Navigate to="/admin/students" replace /></AdminRoute> },
          { path: "admin/families", element: <AdminRoute><FamiliesPage /></AdminRoute> },
          { path: "admin/notifications", element: <AdminRoute><NotificationsPage /></AdminRoute> },
          { path: "admin/leads", element: <AdminRoute><LeadsPage /></AdminRoute> },
          { path: "admin/leads/forms", element: <AdminRoute><LeadFormsPage /></AdminRoute> },
          { path: "admin/jobs", element: <AdminRoute><JobsPage /></AdminRoute> },
          { path: "admin/jobs/:id", element: <AdminRoute><JobDetailPage /></AdminRoute> },
          { path: "admin/quotes", element: <AdminRoute><AdminQuotesPage /></AdminRoute> },
          { path: "admin/quotes/:id", element: <AdminRoute><AdminQuoteEditorPage /></AdminRoute> },
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
    ],
  },
]);

export default router;
