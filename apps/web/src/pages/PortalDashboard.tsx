import { ParentPortal } from '../components/Dashboard';
import { ClientPortal } from '@/features/jobs/components/ClientPortal';
import { useEntityLabels } from '@/hooks/useEntityLabels';

/**
 * PortalDashboard: Light composition page
 * - Acts as a route container, not a logic container
 * - Studios with classes switched on (Platform > Features > Classes): ParentPortal
 *   (classes, enrolment, children when families are on)
 * - Photographers and every studio without classes: ClientPortal (adult client —
 *   bookings, contract, payments, gallery, own details; no children / DOB / enrol)
 * - Used by both ParentRoute and StudentRoute (Phase 1B will differentiate if needed)
 * - WCAG: Semantic structure maintained in child components
 */

export default function PortalDashboard() {
  const { vertical, profile } = useEntityLabels();
  if (vertical === 'photographer' || !profile.teachesClasses) return <ClientPortal />;
  return <ParentPortal />;
}
