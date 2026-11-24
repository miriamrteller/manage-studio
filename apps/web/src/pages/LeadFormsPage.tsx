import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NamedFormsManager } from '@/features/crm/components/NamedFormsManager';

/** Admin → Leads → Forms (/admin/leads/forms). */
export default function LeadFormsPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <Link to="/admin/leads/get" className="text-sm underline">
        {t('pages.crm.tabs.back_to_get')}
      </Link>
      <NamedFormsManager />
    </div>
  );
}
