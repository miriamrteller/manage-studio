import { Navigate } from 'react-router-dom';
import EnrolPage from '@/pages/EnrolPage';
import { useEntityLabels } from '@/hooks/useEntityLabels';

/**
 * /enrol entry. Photographer clients have no class enrolment (and no child /
 * DOB guardian setup): their bookings are shoots, so /enrol sends them to
 * /dashboard, which routes account holders to their client portal.
 * Every other vertical renders the dance enrolment flow unchanged.
 */
export function EnrolEntryRoute() {
  const { vertical } = useEntityLabels();
  if (vertical === 'photographer') return <Navigate to="/dashboard" replace />;
  return <EnrolPage />;
}
