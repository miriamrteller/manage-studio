import { Navigate } from 'react-router-dom';
import EnrolPage from '@/pages/EnrolPage';
import { useWorkModes } from '@/hooks/useWorkModes';

/**
 * /enrol entry. Class sign-up only exists with Classes ticked in "How do clients work with
 * you?" (owner, 13 Nov 2026). Without it, /enrol sends clients to /dashboard, which routes
 * account holders to their client page.
 */
export function EnrolEntryRoute() {
  const { classes } = useWorkModes();
  if (!classes) return <Navigate to="/dashboard" replace />;
  return <EnrolPage />;
}
