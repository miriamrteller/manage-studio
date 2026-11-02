import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import {
  FIRST_LEADS_EVENT,
  FIRST_LEADS_STEPS,
  OPTIONAL_STEPS,
  effectiveDone,
  firstLeadsProgress,
  loadFirstLeads,
  saveFirstLeads,
  type FirstLeadsState,
  type FirstLeadsStep,
} from '../lib/firstLeads';

/** Opens the Get leads section on this page and scrolls to it. */
export function revealGetLeads(): void {
  const el = document.getElementById('get-leads');
  if (el instanceof HTMLDetailsElement) el.open = true;
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * "Get your first leads": a short checklist for new studios on the Leads
 * page. Steps tick themselves when done in the Get leads panel, or by hand.
 * Hidden for good with "Hide this list" (kept on this device).
 */
export function FirstLeadsChecklist({ leadCount }: { leadCount: number }) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const tenantId = tenant?.id;
  const id = useId();
  const [state, setState] = useState<FirstLeadsState>(() => loadFirstLeads(tenantId));

  useEffect(() => {
    setState(loadFirstLeads(tenantId));
    const refresh = () => setState(loadFirstLeads(tenantId));
    window.addEventListener(FIRST_LEADS_EVENT, refresh);
    return () => window.removeEventListener(FIRST_LEADS_EVENT, refresh);
  }, [tenantId]);

  if (!tenantId || state.hidden) return null;

  const done = effectiveDone(state, leadCount);
  const progress = firstLeadsProgress(done);
  const toggle = (step: FirstLeadsStep, checked: boolean) =>
    saveFirstLeads(tenantId, {
      ...state,
      done: checked ? [...new Set([...state.done, step])] : state.done.filter((s) => s !== step),
    });

  const action = (step: FirstLeadsStep) => {
    if (step === 'test_enquiry') {
      return (
        <Button variant="outline" size="sm" onClick={() => window.open('/inquire', '_blank', 'noopener,noreferrer')}>
          {t('pages.crm.first_leads.open_form')}
        </Button>
      );
    }
    return (
      <Button variant="outline" size="sm" onClick={revealGetLeads}>
        {t('pages.crm.first_leads.show_me')}
      </Button>
    );
  };

  return (
    <section aria-labelledby={`${id}-title`} className="card p-4 space-y-3 border border-gray-200">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h2 id={`${id}-title`} className="text-lg font-semibold">
            {progress.complete ? t('pages.crm.first_leads.done_title') : t('pages.crm.first_leads.title')}
          </h2>
          <p className="text-sm text-muted-foreground" role="status">
            {t('pages.crm.first_leads.progress', { done: progress.done, total: progress.total })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/leads/help" className="text-sm underline self-center">
            {t('pages.crm.first_leads.how_it_works')}
          </Link>
          <Button variant="outline" size="sm" onClick={() => saveFirstLeads(tenantId, { ...state, hidden: true })}>
            {t('pages.crm.first_leads.hide')}
          </Button>
        </div>
      </div>
      <ol className="space-y-2">
        {FIRST_LEADS_STEPS.map((step) => {
          const checked = done.has(step);
          const auto = step === 'test_enquiry' && leadCount > 0;
          return (
            <li key={step} className="flex flex-wrap items-start gap-3">
              <input
                id={`${id}-${step}`}
                type="checkbox"
                className="mt-1"
                checked={checked}
                disabled={auto}
                onChange={(e) => toggle(step, e.target.checked)}
                aria-describedby={`${id}-${step}-hint`}
              />
              <div className="flex-1 min-w-48">
                <label htmlFor={`${id}-${step}`} className={checked ? 'font-medium line-through text-muted-foreground' : 'font-medium'}>
                  {t(`pages.crm.first_leads.step_${step}`)}
                  {OPTIONAL_STEPS.includes(step) && (
                    <span className="ms-1 text-xs font-normal text-muted-foreground">{t('pages.crm.first_leads.optional')}</span>
                  )}
                </label>
                <p id={`${id}-${step}-hint`} className="text-xs text-muted-foreground">
                  {t(`pages.crm.first_leads.hint_${step}`)}
                </p>
              </div>
              {!checked && action(step)}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
