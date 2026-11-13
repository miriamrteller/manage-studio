import { PlatformOwnerNotice } from '@/components/PlatformOwnerNotice';
import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { Forward } from "./components/Forward";
import { AdminRoute, ParentRoute, StudentRoute, SuperAdminRoute, TeacherRoute } from "./layouts/RouteGuards";
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
const TeachersPage = lazy(() => import("./pages/TeachersPage"));
const MyClassesPage = lazy(() => import("./pages/MyClassesPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const AdminClassesPage = lazy(() => import("./pages/AdminClassesPage"));
const AdminAppointmentsPage = lazy(() => import("./pages/AdminAppointmentsPage"));
const BookingServicesPage = lazy(() => import("./pages/BookingServicesPage"));
const GoogleCalendarCallbackPage = lazy(() => import("./pages/GoogleCalendarCallbackPage"));
const SmugMugCallbackPage = lazy(() => import("./pages/SmugMugCallbackPage"));
const PhotoShopPage = lazy(() => import("./pages/PhotoShopPage"));
const StudioShopPage = lazy(() => import("./pages/StudioShopPage"));
const WaiversPage = lazy(() => import("./pages/WaiversPage"));
const BookingPage = lazy(() => import("./pages/BookingPage"));
const PortalDashboard = lazy(() => import("./pages/PortalDashboard"));
const EnrolEntryRoute = lazy(() => import("./layouts/EnrolEntryRoute").then((m) => ({ default: m.EnrolEntryRoute })));
const EnrolPayPage = lazy(() => import("./pages/EnrolPayPage"));
const EnrolReturnPage = lazy(() => import("./pages/EnrolReturnPage"));
const EnrolCompletePage = lazy(() => import("./pages/EnrolCompletePage"));
const PayRequestPage = lazy(() => import("./pages/PayRequestPage"));
const SignInLinkPage = lazy(() => import("./pages/SignInLinkPage"));
const ShopLinkPage = lazy(() => import("./pages/ShopLinkPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
const FinanceHubPage = lazy(() => import("./pages/FinanceHubPage"));
const PaymentsLogPage = lazy(() => import("./pages/PaymentsLogPage"));
const ExpensesPage = lazy(() => import("./pages/ExpensesPage"));
const ExpenseCategoriesPage = lazy(() => import("./pages/ExpenseCategoriesPage"));
const FinanceImportPage = lazy(() => import("./pages/FinanceImportPage"));
const ClientImportPage = lazy(() => import("./pages/ClientImportPage"));
const LeadsPage = lazy(() => import("./pages/LeadsPage"));
const JobsPage = lazy(() => import("./pages/JobsPage"));
const JobDetailPage = lazy(() => import("./pages/JobDetailPage"));
const InquirePage = lazy(() => import("./pages/InquirePage"));
const EmbedInquirePage = lazy(() => import("./pages/EmbedInquirePage"));
const EmbedNamedFormPage = lazy(() => import("./pages/EmbedInquirePage").then((m) => ({ default: m.EmbedNamedFormPage })));
const NamedFormPage = lazy(() => import("./pages/NamedFormPage"));
const LeadFormsPage = lazy(() => import("./pages/LeadFormsPage"));
const LeadsHelpPage = lazy(() => import("./pages/LeadsHelpPage"));
const LeadSettingsPage = lazy(() => import("./pages/LeadSettingsPage"));
const PersonPage = lazy(() => import("./pages/PersonPage"));
const ClassCardsSettingsPage = lazy(() => import("./pages/ClassCardsSettingsPage"));
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
          // Booking email "Go to my page": signs the client in (token in the fragment, 3 days).
          { path: 'signin', element: <SignInLinkPage /> },
          { path: 'shop/:token', element: <ShopLinkPage /> },
          { path: 'book', element: <BookingPage /> },
          { path: 'book/:offeringId', element: <BookingPage /> },
          { path: 'inquire', element: <InquirePage /> },
          { path: 'f/:slug', element: <NamedFormPage /> },
          { path: 'quote/:token', element: <QuotePage /> },
          { path: 'legal/:doc', element: <LegalPage /> },
          { path: 'unsubscribe/:token', element: <UnsubscribePage /> },
          { path: 'dashboard', element: <DashboardRedirectPage /> },

          // ADMIN ROUTES
          { path: "teach", element: <TeacherRoute><MyClassesPage /></TeacherRoute> },
          // Admin addresses follow the menu: /admin/<area>/<tab> (owner, 13 Nov 2026).
          { path: "admin", element: <AdminRoute><AdminDashboard /></AdminRoute> },
          { path: "admin/notifications", element: <AdminRoute><NotificationsPage /></AdminRoute> },
          // Leads
          { path: "admin/leads", element: <AdminRoute><LeadsPage /></AdminRoute> },
          { path: "admin/leads/get", element: <AdminRoute><GetLeadsPage /></AdminRoute> },
          { path: "admin/leads/forms", element: <AdminRoute><LeadFormsPage /></AdminRoute> },
          { path: "admin/leads/help", element: <AdminRoute><LeadsHelpPage /></AdminRoute> },
          { path: "admin/leads/settings", element: <AdminRoute><LeadSettingsPage /></AdminRoute> },
          // People
          { path: "admin/people", element: <AdminRoute><StudentsPage /></AdminRoute> },
          { path: "admin/people/import", element: <AdminRoute><ClientImportPage /></AdminRoute> },
          { path: "admin/people/families", element: <AdminRoute><FamiliesPage /></AdminRoute> },
          { path: "admin/people/families/:id", element: <AdminRoute><FamilyDetailPage /></AdminRoute> },
          { path: "admin/people/:personId", element: <AdminRoute><PersonPage /></AdminRoute> },
          // Classes
          { path: "admin/classes", element: <AdminRoute><AdminClassesPage /></AdminRoute> },
          { path: "admin/classes/levels", element: <AdminRoute><LevelsPage /></AdminRoute> },
          { path: "admin/classes/seasons", element: <AdminRoute><TermsPage /></AdminRoute> },
          { path: "admin/classes/teachers", element: <AdminRoute><TeachersPage /></AdminRoute> },
          { path: "admin/classes/cards", element: <AdminRoute><ClassCardsSettingsPage /></AdminRoute> },
          // Projects (shoots) and quotes
          { path: "admin/projects", element: <AdminRoute><JobsPage /></AdminRoute> },
          { path: "admin/projects/quotes", element: <AdminRoute><AdminQuotesPage /></AdminRoute> },
          { path: "admin/projects/quotes/:id", element: <AdminRoute><AdminQuoteEditorPage /></AdminRoute> },
          { path: "admin/projects/:id", element: <AdminRoute><JobDetailPage /></AdminRoute> },
          // Bookings
          { path: "admin/bookings", element: <AdminRoute><Navigate to="/admin/bookings/packages" replace /></AdminRoute> },
          { path: "admin/bookings/packages", element: <AdminRoute><BookingServicesPage /></AdminRoute> },
          { path: "admin/bookings/diary", element: <AdminRoute><AdminAppointmentsPage /></AdminRoute> },
          // Shop
          { path: "admin/shop/photos", element: <AdminRoute><PhotoShopPage /></AdminRoute> },
          { path: "admin/shop/studio", element: <AdminRoute><StudioShopPage /></AdminRoute> },
          // Finance
          { path: "admin/finance", element: <AdminRoute><FinanceHubPage /></AdminRoute> },
          { path: "admin/finance/payments", element: <AdminRoute><PaymentsLogPage /></AdminRoute> },
          { path: "admin/finance/expenses", element: <AdminRoute><ExpensesPage /></AdminRoute> },
          { path: "admin/finance/expenses/categories", element: <AdminRoute><ExpenseCategoriesPage /></AdminRoute> },
          { path: "admin/finance/import", element: <AdminRoute><FinanceImportPage /></AdminRoute> },
          { path: "admin/finance/accounts", element: <AdminRoute><BillingPage /></AdminRoute> },
          // Settings
          { path: "admin/settings", element: <AdminRoute><TenantSettingsPage /></AdminRoute> },
          { path: "admin/settings/waivers", element: <AdminRoute><WaiversPage /></AdminRoute> },
          { path: "admin/settings/payments", element: <AdminRoute><PaymentSettingsPage /></AdminRoute> },
          { path: "admin/settings/invoicing", element: <AdminRoute><InvoicingSettingsPage /></AdminRoute> },
          { path: "admin/settings/bundled-payments", element: <AdminRoute><BundledPaymentsSettingsPage /></AdminRoute> },
          { path: "admin/settings/stripe", element: <AdminRoute><StripeSettingsPage /></AdminRoute> },
          // OAuth callbacks: these addresses are registered with Google and SmugMug. Never change them.
          { path: "admin/setup/integrations/google/callback", element: <GoogleCalendarCallbackPage /> },
          { path: "admin/setup/integrations/smugmug/callback", element: <SmugMugCallbackPage /> },

          // Old addresses forward to the new ones, keeping the rest of the path, the query and the
          // hash (bookmarks, links in emails already sent, and the edge functions' links).
          { path: "admin/setup", element: <Forward from="/admin/setup" to="/admin" /> },
          { path: "admin/setup/settings", element: <Forward from="/admin/setup/settings" to="/admin/settings" /> },
          { path: "admin/setup/waivers", element: <Forward from="/admin/setup/waivers" to="/admin/settings/waivers" /> },
          { path: "admin/setup/payments", element: <Forward from="/admin/setup/payments" to="/admin/settings/payments" /> },
          { path: "admin/setup/invoicing", element: <Forward from="/admin/setup/invoicing" to="/admin/settings/invoicing" /> },
          { path: "admin/setup/bundled-payments", element: <Forward from="/admin/setup/bundled-payments" to="/admin/settings/bundled-payments" /> },
          { path: "admin/setup/grow", element: <Navigate to="/admin/settings/bundled-payments" replace /> },
          { path: "admin/setup/icount", element: <Navigate to="/admin/settings/bundled-payments" replace /> },
          { path: "admin/setup/stripe", element: <Forward from="/admin/setup/stripe" to="/admin/settings/stripe" /> },
          { path: "admin/setup/billing", element: <Forward from="/admin/setup/billing" to="/admin/finance/accounts" /> },
          { path: "admin/setup/levels", element: <Forward from="/admin/setup/levels" to="/admin/classes/levels" /> },
          { path: "admin/setup/terms", element: <Forward from="/admin/setup/terms" to="/admin/classes/seasons" /> },
          { path: "admin/setup/teachers", element: <Forward from="/admin/setup/teachers" to="/admin/classes/teachers" /> },
          { path: "admin/setup/classes", element: <Navigate to="/admin/classes" replace /> },
          { path: "admin/setup/tax", element: <Navigate to="/admin/classes" replace /> },
          { path: "admin/setup/calendar", element: <Navigate to="/classes" replace /> },
          { path: "admin/setup/booking/*", element: <Navigate to="/admin/bookings/diary" replace /> },
          { path: "admin/setup/services", element: <Navigate to="/admin/bookings/packages" replace /> },
          { path: "admin/students/*", element: <Forward from="/admin/students" to="/admin/people" /> },
          { path: "admin/families/*", element: <Forward from="/admin/families" to="/admin/people/families" /> },
          { path: "admin/jobs/*", element: <Forward from="/admin/jobs" to="/admin/projects" /> },
          { path: "admin/quotes/*", element: <Forward from="/admin/quotes" to="/admin/projects/quotes" /> },
          { path: "admin/packages", element: <Forward from="/admin/packages" to="/admin/bookings/packages" /> },
          { path: "admin/appointments", element: <Forward from="/admin/appointments" to="/admin/bookings/diary" /> },
          { path: "admin/photo-shop", element: <Forward from="/admin/photo-shop" to="/admin/shop/photos" /> },
          { path: "admin/shop", element: <Forward from="/admin/shop" to="/admin/shop/studio" /> },
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
