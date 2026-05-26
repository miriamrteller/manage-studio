import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { AdminRoute, ParentRoute, StudentRoute } from "./layouts/RouteGuards";
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
import LevelsPage from "./pages/LevelsPage";
import TermsPage from "./pages/TermsPage";
import AdminClassesPage from "./pages/AdminClassesPage";
import PortalDashboard from "./pages/PortalDashboard";
import EnrolPage from "./pages/EnrolPage";
import EnrolPayPage from "./pages/EnrolPayPage";
import NotFoundPage from "./pages/NotFoundPage";
import { LanguageProvider } from "./contexts/LanguageContext";

function RootLayout() {
  return (
    <LanguageProvider>
      <AppLayout>
        <Outlet />
      </AppLayout>
    </LanguageProvider>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <ClassesPage /> },
      { path: "classes", element: <ClassesPage /> },
      { path: "login", element: <LoginPage /> },
      { path: "signup", element: <SignupPage /> },
      { path: "enrol", element: <EnrolPage /> },
      { path: "enrol/pay/:enrolmentId", element: <EnrolPayPage /> },
      { path: "auth/callback", element: <AuthCallbackPage /> },
      { path: "dashboard", element: <DashboardRedirectPage /> },

      // ADMIN ROUTES
      { path: "admin/students", element: <AdminRoute><StudentsPage /></AdminRoute> },
      // Legacy redirects — keep URLs working
      { path: "admin/people", element: <AdminRoute><Navigate to="/admin/students" replace /></AdminRoute> },
      { path: "admin/families", element: <AdminRoute><FamiliesPage /></AdminRoute> },
      { path: "admin/families/:id", element: <AdminRoute><FamilyDetailPage /></AdminRoute> },
      { path: "admin/setup", element: <AdminRoute><AdminDashboard /></AdminRoute> },
      { path: "admin/setup/billing", element: <AdminRoute><BillingPage /></AdminRoute> },
      { path: "admin/setup/levels", element: <AdminRoute><LevelsPage /></AdminRoute> },
      { path: "admin/setup/terms", element: <AdminRoute><TermsPage /></AdminRoute> },
      { path: "admin/setup/classes", element: <AdminRoute><AdminClassesPage /></AdminRoute> },
      { path: "admin/setup/stripe", element: <AdminRoute><StripeSettingsPage /></AdminRoute> },

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
