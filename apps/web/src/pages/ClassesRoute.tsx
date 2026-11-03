import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { useTenantQuery } from '@/hooks/useTenant';
import { studioHasClasses } from '@/lib/studioSections';
import { ClassesPage } from './ClassesPage';

/**
 * /classes only exists for studios that run classes. A studio that does not (classes switched
 * off) sends the old link to its homepage instead of an empty classes page.
 * Waits for the studio to load first, so a class studio never bounces.
 */
export default function ClassesRoute() {
  const { t } = useTranslation();
  const { tenant, isLoading } = useTenantQuery();
  if (isLoading) return <p role="status">{t('common.loading')}</p>;
  if (tenant && !studioHasClasses({ profile: tenant.profile })) {
    return <Navigate to="/" replace />;
  }
  return <ClassesPage />;
}
