import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NamedFormsManager } from '@/features/crm/components/NamedFormsManager';

/** Admin → Leads → Forms (/admin/leads/forms). */
export default function LeadFormsPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <Link to="/admin/leads" className="text-sm underline">
        {t('pages.crm.named_forms.back')}
      </Link>
      <NamedFormsManager />
    </div>
  );
}
