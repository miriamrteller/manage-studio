import { ParentPortal } from '../components/Dashboard';

/**
 * PortalDashboard: Light composition page
 * - Acts as a route container, not a logic container
 * - Delegates parent portal logic to useParentPortal hook (in ParentPortal)
 * - Delegates UI to ParentPortal component
 * - Used by both ParentRoute and StudentRoute (Phase 1B will differentiate if needed)
 * - WCAG: Semantic structure maintained in child components
 */

export default function PortalDashboard() {
  return <ParentPortal />;
}
