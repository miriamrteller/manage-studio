import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useReportProblem } from '@/components/ReportProblem';
import { useTenant } from '@/hooks/useTenant';
import { helpTopicsFor } from '@/features/help/helpTopics';
import { useAssistant } from '@/features/assistant/AssistantContext';

/**
 * Admin → Help (/admin/help): short how-to guides for the studio's kind of
 * business, en + he, each with a button to the page it is about, and
 * "Ask OpalSwift a question" (Ask OpalSwift when the studio has it, else Send feedback on Help).
 */
export default function HelpPage() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const { canReport, openReportProblem } = useReportProblem();
  // With Ask OpalSwift on, the question goes to it; otherwise to Send feedback (Help).
  const { canAsk, openAssistant } = useAssistant();
  const topics = helpTopicsFor(tenant?.vertical);
  const steps = (id: string): string[] => {
    const value = t(`help.topics.${id}.steps`, { returnObjects: true }) as unknown;
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  };

  const ask = canReport || canAsk ? (
    <section aria-labelledby="help-ask" className="card space-y-2 p-4">
      <h2 id="help-ask" className="text-lg font-semibold">{t('help.ask_title')}</h2>
      <p className="text-muted-foreground">{t('help.ask_text')}</p>
      <Button type="button" onClick={() => (canAsk ? openAssistant() : openReportProblem('help'))}>
        {t('help.ask_button')}
      </Button>
    </section>
  ) : null;

  return (
    <article className="max-w-2xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{t('help.title')}</h1>
        <p className="text-muted-foreground">{t('help.intro')}</p>
      </header>

      {topics.length === 0 ? (
        <p>{t('help.none')}</p>
      ) : (
        <nav aria-label={t('help.contents')}>
          <ul className="list-disc ps-6 space-y-1">
            {topics.map((topic) => (
              <li key={topic.id}>
                <a href={`#help-${topic.id}`} className="underline">
                  {t(`help.topics.${topic.id}.title`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {topics.map((topic) => (
        <section key={topic.id} id={`help-${topic.id}`} aria-labelledby={`help-${topic.id}-title`} className="space-y-2 scroll-mt-4">
          <h2 id={`help-${topic.id}-title`} className="text-xl font-semibold">
            {t(`help.topics.${topic.id}.title`)}
          </h2>
          <p>{t(`help.topics.${topic.id}.summary`)}</p>
          <ol className="list-decimal ps-6 space-y-1">
            {steps(topic.id).map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <Link to={topic.path} className="inline-block text-sm font-medium underline">
            {t('help.open_page')}
          </Link>
        </section>
      ))}

      {ask}
    </article>
  );
}
