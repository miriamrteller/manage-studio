import { Navigate } from 'react-router-dom';
import { JobsList } from '@/features/jobs/components/JobsList';
import { useTenantQuery } from '@/hooks/useTenant';

/**
 * Shoots (jobs) are photographer-only. The nav already hides this page for other
 * verticals, but its address still works: a dance or other studio that lands here
 * (a bookmark, an old link, a demo start page) goes to its Students page instead
 * of a photographer jobs list. Decided only once the tenant has loaded, so a
 * photographer is never bounced while it loads.
 */
export default function JobsPage() {
  const { tenant, isLoading } = useTenantQuery();
  if (!isLoading && tenant && tenant.vertical !== 'photographer') {
    return <Navigate to="/admin/students" replace />;
  }
  return <JobsList />;
}
