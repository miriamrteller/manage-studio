import { Navigate } from 'react-router-dom';
import { FEATURES } from '@shared/index';
import { JobsList } from '@/features/jobs/components/JobsList';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { useTenantQuery } from '@/hooks/useTenant';

/**
 * Projects (jobs, "Shoots" for a photographer) follow the studio's feature set
 * (owner, 13 Nov 2026: the simpler flows work for every industry): any studio with
 * quotes / projects on gets this page. The menu already hides it otherwise, but its
 * address still works: a studio without projects that lands here (a bookmark, an
 * old link, a demo start page) goes to its Students page instead. Decided only once
 * the tenant and its features have loaded, so nobody is bounced while it loads.
 */
export default function JobsPage() {
  const { tenant, isLoading } = useTenantQuery();
  const { hasFeature, isLoading: featuresLoading } = useFeatureGate();
  if (!isLoading && !featuresLoading && tenant && !hasFeature(FEATURES.billing.quotes)) {
    return <Navigate to="/admin/students" replace />;
  }
  return <JobsList />;
}
