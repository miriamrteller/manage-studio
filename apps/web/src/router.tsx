import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { AdminRoute, ParentRoute, StudentRoute, SuperAdminRoute } from "./layouts/RouteGuards";
import { LabelsProvider } from "./contexts/LabelsContext";
import { ClassesPage } from "./pages/ClassesPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import DashboardRedirectPage from "./pages/DashboardRedirectPage";
import AdminDashboard from "./pages/AdminDashboard";
import StudentsPage from "./pages/StudentsPage";
import FamiliesPage from "./pages/FamiliesPage";
import FamilyDetailPage from "./pages/FamilyDetailPage";
import BillingPage from "./pages/BillingPage";
import StripeSettingsPage from "./pages/StripeSettingsPage";
import GrowSettingsPage from "./pages/GrowSettingsPage";
import PaymentSettingsPage from "./pages/PaymentSettingsPage";
import InvoicingSettingsPage from "./pages/InvoicingSettingsPage";
import TaxSettingsPage from "./pages/TaxSettingsPage";
import TenantSettingsPage from "./pages/TenantSettingsPage";
import PlatformOnboardPage from "./pages/PlatformOnboardPage";
import FinanceWalkthroughPage from "./pages/FinanceWalkthroughPage";
import LevelsPage from "./pages/LevelsPage";
import TermsPage from "./pages/TermsPage";
import AdminClassesPage from "./pages/AdminClassesPage";
import WaiversPage from "./pages/WaiversPage";
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
      { path: 'dashboard', element: <DashboardRedirectPage /> },

      // ADMIN ROUTES
      { path: "admin/students", element: <AdminRoute><StudentsPage /></AdminRoute> },
      // Legacy redirects — keep URLs working
      { path: "admin/people", element: <AdminRoute><Navigate to="/admin/students" replace /></AdminRoute> },
      { path: "admin/families", element: <AdminRoute><FamiliesPage /></AdminRoute> },
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
      { path: "admin/setup/settings", element: <AdminRoute><TenantSettingsPage /></AdminRoute> },
      { path: "admin/setup/tax", element: <AdminRoute><TaxSettingsPage /></AdminRoute> },
      { path: "admin/setup/stripe", element: <AdminRoute><StripeSettingsPage /></AdminRoute> },
      { path: "admin/setup/grow", element: <AdminRoute><GrowSettingsPage /></AdminRoute> },
      { path: "admin/setup/payments", element: <AdminRoute><PaymentSettingsPage /></AdminRoute> },
      { path: "admin/setup/invoicing", element: <AdminRoute><InvoicingSettingsPage /></AdminRoute> },
      { path: "admin/setup/waivers", element: <AdminRoute><WaiversPage /></AdminRoute> },
      { path: "admin/dev/finance-walkthrough", element: <AdminRoute><FinanceWalkthroughPage /></AdminRoute> },
      { path: "platform/onboard", element: <SuperAdminRoute><PlatformOnboardPage /></SuperAdminRoute> },

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
