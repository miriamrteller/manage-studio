import { useId, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import { LeadService, type EnrolmentChoice, type Lead } from '../services/leadService';

/**
 * Class studios: where a lead stands against enrolments.
 *  - won by enrolment → "Enrolled: <student> · <class>"
 *  - a suggested match (several leads matched one enrolment) → confirm or dismiss
 *  - otherwise → "Link to enrolment" with a search over recent class enrolments
 * Auto-linking itself happens in the database when someone enrols.
 */
export function LeadEnrolmentLink({
  lead,
  enrolmentsById,
  onLink,
  onDismiss,
  busy,
}: {
  lead: Pick<Lead, 'id' | 'name' | 'stage' | 'converted_account_id' | 'converted_engagement_id' | 'suggested_engagement_id'>;
  enrolmentsById: Map<string, EnrolmentChoice>;
  onLink: (choice: EnrolmentChoice) => void;
  onDismiss: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [picking, setPicking] = useState(false);

  if (lead.converted_engagement_id) {
    const e = enrolmentsById.get(lead.converted_engagement_id);
    return (
      <span className="block text-xs text-green-700">
        {e ? t('pages.crm.pipeline.enrolled', { student: e.student, offering: e.offering }) : t('pages.crm.pipeline.enrolled_short')}
      </span>
    );
  }
  if (lead.converted_account_id || lead.stage === 'lost') return null;

  const suggestion = lead.suggested_engagement_id ? enrolmentsById.get(lead.suggested_engagement_id) : undefined;
  return (
    <div className="mt-1 space-y-1">
      {suggestion && (
        <div className="text-xs rounded border border-amber-300 bg-amber-50 px-2 py-1 space-y-1">
          <p>{t('pages.crm.pipeline.possible_match', { student: suggestion.student, offering: suggestion.offering })}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" disabled={busy} onClick={() => onLink(suggestion)}>
              {t('pages.crm.pipeline.confirm_match')}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={onDismiss}>
              {t('pages.crm.pipeline.not_this_one')}
            </Button>
          </div>
        </div>
      )}
      {picking ? (
        <EnrolmentPicker
          leadName={lead.name}
          busy={busy}
          onPick={(choice) => {
            onLink(choice);
            setPicking(false);
          }}
          onCancel={() => setPicking(false)}
        />
      ) : (
        <button type="button" className="text-xs underline" onClick={() => setPicking(true)}>
          {t('pages.crm.pipeline.link_enrolment')}
        </button>
      )}
    </div>
  );
}

function EnrolmentPicker({
  leadName,
  busy,
  onPick,
  onCancel,
}: {
  leadName: string;
  busy: boolean;
  onPick: (choice: EnrolmentChoice) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const id = useId();
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: ['class-enrolments', tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: () => LeadService.enrolments(tenant!),
  });
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = query.data ?? [];
    return (q ? all.filter((e) => e.student.toLowerCase().includes(q) || e.offering.toLowerCase().includes(q)) : all).slice(0, 8);
  }, [query.data, search]);

  return (
    <div className="rounded border p-2 space-y-2 text-xs">
      <label htmlFor={`${id}-search`} className="block font-medium">
        {t('pages.crm.pipeline.search_label', { name: leadName })}
      </label>
      <input
        id={`${id}-search`}
        className="w-full border rounded px-2 py-1"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('pages.crm.pipeline.search_placeholder')}
      />
      {query.isLoading && <p role="status">{t('common.loading')}</p>}
      <ul className="space-y-1">
        {matches.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-2">
            <span dir="auto">
              {e.student} · {e.offering}
            </span>
            <Button size="sm" variant="outline" disabled={busy || !e.account_id} onClick={() => onPick(e)}>
              {t('pages.crm.pipeline.link')}
            </Button>
          </li>
        ))}
        {!query.isLoading && matches.length === 0 && <li>{t('pages.crm.pipeline.no_enrolments')}</li>}
      </ul>
      <Button size="sm" variant="outline" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
    </div>
  );
}
