import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LeadsTabs } from '@/features/crm/components/LeadsTabs';
import { FirstLeadsChecklist } from '@/features/crm/components/FirstLeadsChecklist';
import { GetLeadsPanel } from '@/features/crm/components/GetLeadsPanel';
import { useLeads } from '@/features/crm/hooks/useLeads';

/** Admin → Leads → Get leads (/admin/leads/get): links, embed, QR, forms and help. */
export default function GetLeadsPage() {
  const { t } = useTranslation();
  const { leads, isLoading } = useLeads();
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t('pages.crm.get_leads.title')}</h1>
      <LeadsTabs />
      {!isLoading && <FirstLeadsChecklist leadCount={leads.length} />}
      <section id="get-leads" aria-labelledby="get-leads-links" className="space-y-3">
        <h2 id="get-leads-links" className="sr-only">
          {t('pages.crm.get_leads.title')}
        </h2>
        <GetLeadsPanel headingLevel={3} />
      </section>
      <section aria-labelledby="get-leads-more" className="space-y-2">
        <h2 id="get-leads-more" className="text-xl font-semibold">
          {t('pages.crm.tabs.more_title')}
        </h2>
        <ul className="space-y-2">
          <li>
            <Link to="/admin/leads/forms" className="font-medium underline">
              {t('pages.crm.named_forms.title')}
            </Link>
            <p className="text-sm text-muted-foreground">{t('pages.crm.tabs.forms_hint')}</p>
          </li>
          <li>
            <Link to="/admin/leads/help" className="font-medium underline">
              {t('pages.crm.help.link')}
            </Link>
            <p className="text-sm text-muted-foreground">{t('pages.crm.tabs.help_hint')}</p>
          </li>
        </ul>
      </section>
    </div>
  );
}
