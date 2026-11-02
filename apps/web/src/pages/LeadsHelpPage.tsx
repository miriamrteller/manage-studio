import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LeadsTabs } from '@/features/crm/components/LeadsTabs';

const SECTIONS = ['where', 'form', 'stages', 'enrol', 'daily', 'privacy'] as const;

/** Admin → Leads → How leads work (/admin/leads/help): simple steps, en + he. */
export default function LeadsHelpPage() {
  const { t } = useTranslation();
  const steps = (key: string): string[] => {
    const value = t(`pages.crm.help.${key}_steps`, { returnObjects: true }) as unknown;
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  };
  return (
    <article className="max-w-2xl space-y-6">
      <LeadsTabs />
      <Link to="/admin/leads/get" className="text-sm underline">
        {t('pages.crm.tabs.back_to_get')}
      </Link>
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{t('pages.crm.help.title')}</h1>
        <p className="text-muted-foreground">{t('pages.crm.help.intro')}</p>
      </header>
      {SECTIONS.map((key, i) => (
        <section key={key} aria-labelledby={`help-${key}`} className="space-y-2">
          <h2 id={`help-${key}`} className="text-xl font-semibold">
            {i + 1}. {t(`pages.crm.help.${key}_title`)}
          </h2>
          <ol className="list-decimal ps-6 space-y-1">
            {steps(key).map((step, j) => (
              <li key={j}>{step}</li>
            ))}
          </ol>
        </section>
      ))}
      <p className="text-sm text-muted-foreground">{t('pages.crm.help.contact')}</p>
    </article>
  );
}
