import { PlatformOwnerNotice } from '@/components/PlatformOwnerNotice';
import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { AdminRoute, ParentRoute, StudentRoute, SuperAdminRoute } from "./layouts/RouteGuards";
import { LabelsProvider } from "./contexts/LabelsContext";
import { StudioHostGate } from "./layouts/StudioHostGate";
import { LanguageProvider } from "./contexts/LanguageContext";
import { RouteErrorFallback } from "./components/RouteErrorFallback";
import { MonitoringContextSync } from "./lib/monitoring/MonitoringContextSync";
import { StudioFavicon } from "./components/StudioFavicon";
import { RouteLoading } from "./components/RouteLoading";

// Pages load on demand, so a visitor downloads only the area they open
// (a parent on an enrolment link never downloads the admin or finance pages).
const ClassesRoute = lazy(() => import("./pages/ClassesRoute"));
const HomePage = lazy(() => import("./pages/HomePage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const SignupPage = lazy(() => import("./pages/SignupPage"));
const AuthCallbackPage = lazy(() => import("./pages/AuthCallbackPage"));
const CreateStudioPage = lazy(() => import("@/pages/CreateStudioPage"));
const SessionHandoffPage = lazy(() => import("@/pages/auth/SessionHandoffPage"));
const NewPasswordPage = lazy(() => import("@/pages/auth/NewPasswordPage"));
const EmailChangedPage = lazy(() => import("@/pages/auth/EmailChangedPage"));
const LegalPackPrintPage = lazy(() => import("@/pages/LegalPackPrintPage"));
const DashboardRedirectPage = lazy(() => import("./pages/DashboardRedirectPage"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const StudentsPage = lazy(() => import("./pages/StudentsPage"));
const FamiliesPage = lazy(() => import("./pages/FamiliesPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const FamilyDetailPage = lazy(() => import("./pages/FamilyDetailPage"));
const BillingPage = lazy(() => import("./pages/BillingPage"));
const StripeSettingsPage = lazy(() => import("./pages/StripeSettingsPage"));
const BundledPaymentsSettingsPage = lazy(() => import("./pages/BundledPaymentsSettingsPage"));
const PaymentSettingsPage = lazy(() => import("./pages/PaymentSettingsPage"));
const InvoicingSettingsPage = lazy(() => import("./pages/InvoicingSettingsPage"));
const TenantSettingsPage = lazy(() => import("./pages/TenantSettingsPage"));
const PlatformOnboardPage = lazy(() => import("./pages/PlatformOnboardPage"));
const PlatformFeaturesPage = lazy(() => import("./pages/PlatformFeaturesPage"));
const PlatformBillingPage = lazy(() => import("./pages/PlatformBillingPage"));
const PlatformFeedbackPage = lazy(() => import("./pages/PlatformFeedbackPage"));
const SkinsPage = lazy(() => import("./features/skins/SkinsPage"));
const FinanceWalkthroughPage = lazy(() => import("./pages/FinanceWalkthroughPage"));
const LevelsPage = lazy(() => import("./pages/LevelsPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const AdminClassesPage = lazy(() => import("./pages/AdminClassesPage"));
const AdminAppointmentsPage = lazy(() => import("./pages/AdminAppointmentsPage"));
const BookingSettingsPage = lazy(() => import("./pages/BookingSettingsPage"));
const BookingServicesPage = lazy(() => import("./pages/BookingServicesPage"));
const GoogleCalendarCallbackPage = lazy(() => import("./pages/GoogleCalendarCallbackPage"));
const SmugMugCallbackPage = lazy(() => import("./pages/SmugMugCallbackPage"));
const PhotoShopPage = lazy(() => import("./pages/PhotoShopPage"));
const WaiversPage = lazy(() => import("./pages/WaiversPage"));
const BookingPage = lazy(() => import("./pages/BookingPage"));
const PortalDashboard = lazy(() => import("./pages/PortalDashboard"));
const EnrolEntryRoute = lazy(() => import("./layouts/EnrolEntryRoute").then((m) => ({ default: m.EnrolEntryRoute })));
const EnrolPayPage = lazy(() => import("./pages/EnrolPayPage"));
const EnrolReturnPage = lazy(() => import("./pages/EnrolReturnPage"));
const EnrolCompletePage = lazy(() => import("./pages/EnrolCompletePage"));
const PayRequestPage = lazy(() => import("./pages/PayRequestPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
const FinanceHubPage = lazy(() => import("./pages/FinanceHubPage"));
const PaymentsLogPage = lazy(() => import("./pages/PaymentsLogPage"));
const ExpensesPage = lazy(() => import("./pages/ExpensesPage"));
const ExpenseCategoriesPage = lazy(() => import("./pages/ExpenseCategoriesPage"));
const FinanceImportPage = lazy(() => import("./pages/FinanceImportPage"));
const LeadsPage = lazy(() => import("./pages/LeadsPage"));
const JobsPage = lazy(() => import("./pages/JobsPage"));
const JobDetailPage = lazy(() => import("./pages/JobDetailPage"));
const InquirePage = lazy(() => import("./pages/InquirePage"));
const EmbedInquirePage = lazy(() => import("./pages/EmbedInquirePage"));
const EmbedNamedFormPage = lazy(() => import("./pages/EmbedInquirePage").then((m) => ({ default: m.EmbedNamedFormPage })));
const NamedFormPage = lazy(() => import("./pages/NamedFormPage"));
const LeadFormsPage = lazy(() => import("./pages/LeadFormsPage"));
const LeadsHelpPage = lazy(() => import("./pages/LeadsHelpPage"));
const GetLeadsPage = lazy(() => import("./pages/GetLeadsPage"));
const AdminQuotesPage = lazy(() => import("./pages/AdminQuotesPage"));
const AdminQuoteEditorPage = lazy(() => import("./pages/AdminQuoteEditorPage"));
const QuotePage = lazy(() => import("./pages/QuotePage"));
const LegalPage = lazy(() => import("./pages/LegalPage"));
const UnsubscribePage = lazy(() => import("./pages/UnsubscribePage"));

function Page({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteLoading />}>{children}</Suspense>;
}

function RootLayout() {
  return (
    <LanguageProvider>
      <StudioFavicon />
      <StudioHostGate>
        <LabelsProvider>
          <AppLayout>
            <MonitoringContextSync />
            <Page>
              <Outlet />
            </Page>
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
      <Page>
        <LanguageProvider>
          <AuthCallbackPage />
        </LanguageProvider>
      </Page>
    ),
  },
  // Login-email change confirmations land here (through /auth/callback).
  {
    path: '/auth/email-changed',
    element: (
      <Page>
        <LanguageProvider>
          <EmailChangedPage />
        </LanguageProvider>
      </Page>
    ),
  },
  // "Forgot password?" emails land here (through /auth/callback, which signs the person in).
  {
    path: '/auth/new-password',
    element: (
      <Page>
        <LanguageProvider>
          <NewPasswordPage />
        </LanguageProvider>
      </Page>
    ),
  },
  // Self-serve studio signup (free beta) on app.opalswift.com. Off unless
  // VITE_ENABLE_SELF_SERVE_SIGNUP=true (the page then redirects to /login); the
  // provision-studio function has its own switch, SELF_SERVE_SIGNUP_ENABLED.
  {
    path: '/create-studio',
    element: (
      <Page>
        <LanguageProvider>
          <CreateStudioPage />
        </LanguageProvider>
      </Page>
    ),
  },
  // Enquiry form for an iframe on the studio's own site: no app chrome. The
  // only framable path (public/_headers, /embed/*).
  {
    path: '/embed/inquire',
    element: <Page><EmbedInquirePage /></Page>,
    errorElement: <RouteErrorFallback />,
  },
  // The studio's legal pack as one printable page (Save as PDF), on any host.
  {
    path: '/legal-pack/print',
    element: (
      <Page>
        <LanguageProvider>
          <LegalPackPrintPage />
        </LanguageProvider>
      </Page>
    ),
  },
  {
    path: '/embed/f/:slug',
    element: <Page><EmbedNamedFormPage /></Page>,
    errorElement: <RouteErrorFallback />,
  },
  {
    path: '/auth/session-handoff',
    element: <Page><SessionHandoffPage /></Page>,
  },
  {
    path: '/platform-owner',
    element: <Page><PlatformOwnerNotice /></Page>,
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
          { index: true, element: <HomePage /> },
          { path: 'classes', element: <ClassesRoute /> },
          { path: 'login', element: <LoginPage /> },
          { path: 'signup', element: <SignupPage /> },
          { path: 'enrol', element: <EnrolEntryRoute /> },
          { path: 'enrol/pay/:engagementId', element: <EnrolPayPage /> },
          // Where YPay sends the parent back after its payment page.
          { path: 'enrol/return/:engagementId', element: <EnrolReturnPage /> },
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
          { path: "admin/leads/get", element: <AdminRoute><GetLeadsPage /></AdminRoute> },
          { path: "admin/leads/forms", element: <AdminRoute><LeadFormsPage /></AdminRoute> },
          { path: "admin/leads/help", element: <AdminRoute><LeadsHelpPage /></AdminRoute> },
          { path: "admin/jobs", element: <AdminRoute><JobsPage /></AdminRoute> },
          { path: "admin/jobs/:id", element: <AdminRoute><JobDetailPage /></AdminRoute> },
          { path: "admin/photo-shop", element: <AdminRoute><PhotoShopPage /></AdminRoute> },
          { path: "admin/quotes", element: <AdminRoute><AdminQuotesPage /></AdminRoute> },
          { path: "admin/quotes/:id", element: <AdminRoute><AdminQuoteEditorPage /></AdminRoute> },
          { path: "admin/appointments", element: <AdminRoute><AdminAppointmentsPage /></AdminRoute> },
          { path: "admin/families/:id", element: <AdminRoute><FamilyDetailPage /></AdminRoute> },
          { path: "admin/finance", element: <AdminRoute><FinanceHubPage /></AdminRoute> },
          { path: "admin/finance/payments", element: <AdminRoute><PaymentsLogPage /></AdminRoute> },
          { path: "admin/finance/expenses", element: <AdminRoute><ExpensesPage /></AdminRoute> },
          { path: "admin/finance/expenses/categories", element: <AdminRoute><ExpenseCategoriesPage /></AdminRoute> },
          { path: "admin/finance/import", element: <AdminRoute><FinanceImportPage /></AdminRoute> },
          { path: "admin/setup", element: <AdminRoute><AdminDashboard /></AdminRoute> },
          { path: "admin/setup/billing", element: <AdminRoute><BillingPage /></AdminRoute> },
          { path: "admin/setup/levels", element: <AdminRoute><LevelsPage /></AdminRoute> },
          { path: "admin/setup/terms", element: <AdminRoute><TermsPage /></AdminRoute> },
          { path: "admin/classes", element: <AdminRoute><AdminClassesPage /></AdminRoute> },
          { path: "admin/setup/classes", element: <AdminRoute><Navigate to="/admin/classes" replace /></AdminRoute> },
          // Legacy redirect — the admin-only calendar was removed in favour of the
          // client-facing classes calendar on /classes.
          { path: "admin/setup/calendar", element: <AdminRoute><Navigate to="/classes" replace /></AdminRoute> },
          { path: "admin/setup/booking", element: <AdminRoute><BookingSettingsPage /></AdminRoute> },
          { path: "admin/packages", element: <AdminRoute><BookingServicesPage /></AdminRoute> },
          { path: "admin/setup/services", element: <AdminRoute><Navigate to="/admin/packages" replace /></AdminRoute> },
          // Not wrapped in AdminRoute here: on app.<root> it first returns to the studio's own address.
          { path: "admin/setup/integrations/google/callback", element: <GoogleCalendarCallbackPage /> },
          { path: "admin/setup/integrations/smugmug/callback", element: <AdminRoute><SmugMugCallbackPage /></AdminRoute> },
          { path: "admin/setup/settings", element: <AdminRoute><TenantSettingsPage /></AdminRoute> },
          { path: "admin/setup/tax", element: <AdminRoute><Navigate to="/admin/classes" replace /></AdminRoute> },
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
          { path: "platform/billing", element: <SuperAdminRoute><PlatformBillingPage /></SuperAdminRoute> },
          { path: "platform/feedback", element: <SuperAdminRoute><PlatformFeedbackPage /></SuperAdminRoute> },
          { path: "platform/skins", element: <SuperAdminRoute><SkinsPage /></SuperAdminRoute> },

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
