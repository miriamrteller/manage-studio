import { ParentPortal } from '../components/Dashboard';
import { ClientPortal } from '@/features/jobs/components/ClientPortal';
import { useWorkModes } from '@/hooks/useWorkModes';

/**
 * PortalDashboard: Light composition page
 * - Acts as a route container, not a logic container
 * - Follows "How do clients work with you?", not the business type (owner, 13 Nov 2026):
 *   - Classes: ParentPortal (useParentPortal): the account's people, their classes, class cards
 *   - No classes: ClientPortal (adult client: projects, contract, payments, gallery, own details;
 *     no children / DOB / enrol)
 * - Used by both ParentRoute and StudentRoute
 * - WCAG: Semantic structure maintained in child components
 */

export default function PortalDashboard() {
  const { classes } = useWorkModes();
  if (!classes) return <ClientPortal />;
  return <ParentPortal />;
}
