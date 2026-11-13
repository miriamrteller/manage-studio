import { useTranslation } from 'react-i18next';
import { LeadFormSettings } from '@/features/settings/components/LeadFormSettings';
import { LeadDigestSetting } from '@/features/settings/components/LeadDigestSetting';

/**
 * Leads → Enquiry settings (/admin/leads/settings): the questions on the enquiry form and the
 * daily follow-up email. Was the Leads section of Settings.
 */
export default function LeadSettingsPage() {
  const { t } = useTranslation();
  return (
    <div className="max-w-3xl space-y-10">
      <h1 className="text-3xl font-bold">{t('nav.tab.lead_settings')}</h1>
      <LeadFormSettings />
      <hr className="border-gray-200" />
      <LeadDigestSetting />
    </div>
  );
}
