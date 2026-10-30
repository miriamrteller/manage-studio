import { ParentPortal } from '../components/Dashboard';
import { ClientPortal } from '@/features/jobs/components/ClientPortal';
import { useEntityLabels } from '@/hooks/useEntityLabels';

/**
 * PortalDashboard: Light composition page
 * - Acts as a route container, not a logic container
 * - Photographer tenants: ClientPortal (adult client — shoots, contract,
 *   payments, gallery, own details; no children / DOB / enrol)
 * - Every other vertical: ParentPortal (useParentPortal), unchanged
 * - Used by both ParentRoute and StudentRoute (Phase 1B will differentiate if needed)
 * - WCAG: Semantic structure maintained in child components
 */

export default function PortalDashboard() {
  const { vertical } = useEntityLabels();
  if (vertical === 'photographer') return <ClientPortal />;
  return <ParentPortal />;
}
