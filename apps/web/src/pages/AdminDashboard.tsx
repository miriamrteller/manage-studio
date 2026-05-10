import { AdminPanel } from '../components/Dashboard';

/**
 * AdminDashboard: Light composition page
 * - Acts as a route container, not a logic container
 * - Delegates admin logic to useAdminDashboard hook (in AdminPanel)
 * - Delegates UI to AdminPanel component
 * - WCAG: Semantic structure maintained in child components
 */

export default function AdminDashboard() {
  return <AdminPanel />;
}
