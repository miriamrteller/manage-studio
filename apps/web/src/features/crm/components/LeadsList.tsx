import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { followUpState } from '../lib/followUp';
import { useNavigate } from 'react-router-dom';
import { LeadsTabs } from './LeadsTabs';
import { useNamedForms } from '../hooks/useNamedForms';
import { answerText, FORM_TIME_ZONE, todayIn } from '@shared/index';
import { answerFilterOptions, filterByAnswer } from '../lib/leadAnswers';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import { useLeads } from '../hooks/useLeads';
import { ConvertLeadPanel } from '@/features/jobs/components/ConvertLeadPanel';
import { CreateQuoteButton } from '@/features/quotes/components/CreateQuoteButton';
import {
  LEAD_CHANNELS,
  LeadDeleteError,
  isConvertedLead,
  stagesFor,
  type Lead,
  type LeadChannel,
  type LeadStage,
} from '../services/leadService';
import { LeadEnrolmentLink } from './LeadEnrolmentLink';

/**
 * Admin leads page (the Leads tab): the pipeline first — a manual "new lead"
 * form for walk-ins/phone/WhatsApp inquiries, follow-ups, filters and the list
 * with inline stage updates. Getting leads (links, embed, QR, forms, help) is
 * the sibling Get leads tab. Leads are a separate entity from students/families.
 */

function formatDate(value: string | null, locale: string): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}


interface LeadRowGroupProps {
  lead: Pick<Lead, 'id' | 'name' | 'offering_id' | 'answers' | 'event_date'>;
  converting: boolean;
  canConvert: boolean;
  onConvert: () => void;
  onClose: () => void;
  children: ReactNode;
}

/** A lead row plus, when converting, the inline convert panel beneath it. */
function LeadRowGroup({ lead, converting, canConvert, onClose, children }: LeadRowGroupProps) {
  return (
    <>
      {children}
      {canConvert && converting && (
        <tr>
          <td colSpan={9} className="px-3 py-2">
            <ConvertLeadPanel
              leadId={lead.id}
              leadName={lead.name}
              defaultOfferingId={lead.offering_id}
              defaultLocation={answerPlain(lead.answers?.event_location)}
              eventDate={lead.event_date}
              onClose={onClose}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function answerPlain(answer: { value: unknown } | undefined): string | null {
  return answer && typeof answer.value === 'string' ? answer.value : null;
}

/** Enquiry-form answers for one lead: typed fields first, then the rest. */
function LeadAnswers({ lead, lang }: { lead: Lead; lang: 'en' | 'he' }) {
  const { t, i18n } = useTranslation();
  const rows: Array<[string, string]> = [];
  if (lead.child_name) rows.push([t('pages.crm.leads.child_name'), lead.child_name]);
  if (lead.child_birth_date) rows.push([t('pages.crm.leads.child_birth_date'), formatDate(lead.child_birth_date, i18n.language)]);
  if (lead.event_date) rows.push([t('pages.crm.leads.event_date'), formatDate(lead.event_date, i18n.language)]);
  for (const answer of Object.values(lead.answers ?? {})) {
    rows.push([answer.label[lang] || answer.label.en, answerText(answer, lang)]);
  }
  if (rows.length === 0) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-muted-foreground">
        {t('pages.crm.leads.form_answers', { count: rows.length })}
      </summary>
      <dl className="mt-1 space-y-0.5 text-xs">
        {rows.map(([label, value], i) => (
          <div key={i}>
            <dt className="inline font-medium">{label}: </dt>
            <dd className="inline" dir="auto">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function LeadsList() {
  const { t, i18n } = useTranslation();
  const { vertical } = useEntityLabels();
  const canConvert = vertical === 'photographer';
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const {
    leads: allLeads,
    isLoading,
    error,
    createLead,
    isCreating,
    updateStage,
    isUpdatingStage,
    enrolmentsById,
    linkToEnrolment,
    linkError,
    isLinking,
    dismissSuggestion,
    deleteLead,
    deleteError,
    isDeleting,
  } = useLeads();
  const navigate = useNavigate();
  const [deleted, setDeleted] = useState<string | null>(null);
  const handleDelete = (lead: Lead) => {
    if (isConvertedLead(lead)) return;
    if (!window.confirm(t('pages.crm.leads.delete_confirm', { name: lead.name }))) return;
    setDeleted(null);
    deleteLead(lead.id, { onSuccess: () => setDeleted(t('pages.crm.leads.deleted', { name: lead.name })) });
  };
  const deleteMessage =
    deleteError instanceof LeadDeleteError
      ? t(`pages.crm.leads.delete_blocked_${deleteError.reason}`)
      : deleteError
        ? t('pages.crm.leads.delete_failed')
        : null;
  const lang: 'en' | 'he' = i18n.language?.startsWith('he') ? 'he' : 'en';
  const [answerKey, setAnswerKey] = useState('');
  const [answerValue, setAnswerValue] = useState('');
  const answerOptions = useMemo(() => answerFilterOptions(allLeads, lang), [allLeads, lang]);
  const today = todayIn(FORM_TIME_ZONE);
  const followUps = useMemo(() => {
    let overdue = 0;
    let dueToday = 0;
    for (const l of allLeads) {
      const state = followUpState(l, today);
      if (state === 'overdue') overdue += 1;
      if (state === 'today') dueToday += 1;
    }
    return { overdue, dueToday };
  }, [allLeads, today]);
  const [source, setSource] = useState('');
  const [formFilter, setFormFilter] = useState('');
  const { forms: namedForms } = useNamedForms();
  const formNames = useMemo(() => new Map(namedForms.map((f) => [f.id, f.name])), [namedForms]);
  const sources = useMemo(() => LEAD_CHANNELS.filter((c) => allLeads.some((l) => l.channel === c)), [allLeads]);
  const leads = useMemo(
    () =>
      filterByAnswer(
        allLeads.filter(
          (l) =>
            (!source || l.channel === source) &&
            (!formFilter || (formFilter === 'general' ? !l.form_id : l.form_id === formFilter)),
        ),
        answerKey,
        answerValue,
        lang,
      ),
    [allLeads, source, formFilter, answerKey, answerValue, lang],
  );
  const valuesForKey = answerOptions.find((o) => o.key === answerKey)?.values ?? [];

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [channel, setChannel] = useState<LeadChannel>('website');
  const [interest, setInterest] = useState('');
  const [note, setNote] = useState('');
  const [followUp, setFollowUp] = useState('');


  const resetForm = () => {
    setName('');
    setEmail('');
    setPhone('');
    setChannel('website');
    setInterest('');
    setNote('');
    setFollowUp('');
  };

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    createLead(
      {
        name,
        email: email || null,
        phone: phone || null,
        channel,
        interest: interest || null,
        note: note || null,
        next_follow_up_at: followUp || null,
      },
      {
        onSuccess: () => {
          resetForm();
          setShowForm(false);
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{t('pages.crm.leads.title')}</h1>
        <Button variant="primary" onClick={() => setShowForm((open) => !open)}>
          {showForm ? t('common.cancel') : t('pages.crm.leads.add')}
        </Button>
      </div>
      <LeadsTabs />
      <p className="text-sm text-muted-foreground">{t('pages.crm.leads.description')}</p>
      {(followUps.overdue > 0 || followUps.dueToday > 0) && (
        <p role="status" className="text-sm font-medium">
          {t('pages.crm.leads.follow_up_summary', { overdue: followUps.overdue, today: followUps.dueToday })}
        </p>
      )}


      {showForm && (
        <form onSubmit={handleCreate} className="card p-4 space-y-3" aria-label={t('pages.crm.leads.add')}>
          <h2 className="font-semibold">{t('pages.crm.leads.add')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="lead-name" className="block text-sm font-medium mb-1">
                {t('pages.crm.leads.name')} *
              </label>
              <input
                id="lead-name"
                required
                className="w-full border rounded px-3 py-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="lead-channel" className="block text-sm font-medium mb-1">
                {t('pages.crm.leads.channel')}
              </label>
              <select
                id="lead-channel"
                className="w-full border rounded px-3 py-2"
                value={channel}
                onChange={(e) => setChannel(e.target.value as LeadChannel)}
              >
                {LEAD_CHANNELS.map((value) => (
                  <option key={value} value={value}>
                    {t(`pages.crm.leads.channel_${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="lead-email" className="block text-sm font-medium mb-1">
                {t('pages.crm.leads.email')}
              </label>
              <input
                id="lead-email"
                type="email"
                className="w-full border rounded px-3 py-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="lead-phone" className="block text-sm font-medium mb-1">
                {t('pages.crm.leads.phone')}
              </label>
              <input
                id="lead-phone"
                type="tel"
                className="w-full border rounded px-3 py-2"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="lead-interest" className="block text-sm font-medium mb-1">
                {t('pages.crm.leads.interest')}
              </label>
              <input
                id="lead-interest"
                className="w-full border rounded px-3 py-2"
                value={interest}
                onChange={(e) => setInterest(e.target.value)}
                placeholder={t('pages.crm.leads.interest_placeholder')}
              />
            </div>
            <div>
              <label htmlFor="lead-follow-up" className="block text-sm font-medium mb-1">
                {t('pages.crm.leads.follow_up')}
              </label>
              <input
                id="lead-follow-up"
                type="date"
                className="w-full border rounded px-3 py-2"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label htmlFor="lead-note" className="block text-sm font-medium mb-1">
              {t('pages.crm.leads.note')}
            </label>
            <textarea
              id="lead-note"
              rows={2}
              className="w-full border rounded px-3 py-2"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <Button type="submit" variant="primary" disabled={isCreating}>
            {t('pages.crm.leads.save')}
          </Button>
        </form>
      )}

      {isLoading && <p role="status">{t('common.loading')}</p>}
      {(error || linkError) && (
        <div className="alert-error" role="alert">
          {(error ?? linkError)?.message}
        </div>
      )}
      {deleteMessage && (
        <div className="alert-error" role="alert">
          {deleteMessage}
        </div>
      )}
      <p role="status" className="sr-only">
        {deleted ?? ''}
      </p>

      {allLeads.length > 0 && (
        <div className="flex flex-wrap items-end gap-3" role="search" aria-label={t('pages.crm.leads.filter_answers')}>
          <div>
            <label htmlFor="lead-source" className="block text-sm font-medium mb-1">
              {t('pages.crm.leads.filter_source')}
            </label>
            <select id="lead-source" className="border rounded px-2 py-1" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">{t('pages.crm.leads.filter_any')}</option>
              {sources.map((c) => (
                <option key={c} value={c}>
                  {t(`pages.crm.leads.channel_${c}`)}
                </option>
              ))}
            </select>
          </div>
          {namedForms.length > 0 && (
            <div>
              <label htmlFor="lead-form-filter" className="block text-sm font-medium mb-1">
                {t('pages.crm.leads.filter_form')}
              </label>
              <select
                id="lead-form-filter"
                className="border rounded px-2 py-1"
                value={formFilter}
                onChange={(e) => setFormFilter(e.target.value)}
              >
                <option value="">{t('pages.crm.leads.filter_any')}</option>
                <option value="general">{t('pages.crm.leads.form_general')}</option>
                {namedForms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {answerOptions.length > 0 && (
          <div>
            <label htmlFor="lead-answer-key" className="block text-sm font-medium mb-1">
              {t('pages.crm.leads.filter_question')}
            </label>
            <select
              id="lead-answer-key"
              className="border rounded px-2 py-1"
              value={answerKey}
              onChange={(e) => {
                setAnswerKey(e.target.value);
                setAnswerValue('');
              }}
            >
              <option value="">{t('pages.crm.leads.filter_any')}</option>
              {answerOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          )}
          {answerKey && (
            <div>
              <label htmlFor="lead-answer-value" className="block text-sm font-medium mb-1">
                {t('pages.crm.leads.filter_answer')}
              </label>
              <select
                id="lead-answer-value"
                className="border rounded px-2 py-1"
                value={answerValue}
                onChange={(e) => setAnswerValue(e.target.value)}
              >
                <option value="">{t('pages.crm.leads.filter_any')}</option>
                {valuesForKey.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {!isLoading && allLeads.length === 0 && (
        <EmptyState
          title={t('pages.crm.leads.empty_title')}
          message={t('pages.crm.leads.empty_message_get')}
          actionLabel={t('pages.crm.leads.empty_action')}
          onAction={() => navigate('/admin/leads/get')}
        />
      )}
      {!isLoading && allLeads.length > 0 && leads.length === 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('pages.crm.leads.filter_none')}
        </p>
      )}

      {leads.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-start">{t('pages.crm.leads.name')}</th>
                <th className="px-3 py-2 text-start">{t('pages.crm.leads.contact')}</th>
                <th className="px-3 py-2 text-start">{t('pages.crm.leads.channel')}</th>
                <th className="px-3 py-2 text-start">{t('pages.crm.leads.interest')}</th>
                <th className="px-3 py-2 text-start">{t('pages.crm.leads.stage')}</th>
                <th className="px-3 py-2 text-start">{t('pages.crm.leads.last_contacted')}</th>
                <th className="px-3 py-2 text-start">{t('pages.crm.leads.follow_up')}</th>
                {canConvert && <th className="px-3 py-2 text-start">{t('pages.crm.leads.convert')}</th>}
                <th className="px-3 py-2 text-start">
                  <span className="sr-only">{t('pages.crm.leads.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <LeadRowGroup
                  key={lead.id}
                  converting={convertingId === lead.id}
                  canConvert={canConvert}
                  onConvert={() => setConvertingId(lead.id)}
                  onClose={() => setConvertingId(null)}
                  lead={lead}
                >
                <tr>
                  <td className="px-3 py-2 font-medium">
                    {lead.name}
                    {lead.converted_account_id && (
                      <span className="ms-2 text-xs text-muted-foreground">
                        {t('pages.crm.leads.converted')}
                      </span>
                    )}
                    {!canConvert && (
                      <LeadEnrolmentLink
                        lead={lead}
                        enrolmentsById={enrolmentsById}
                        busy={isLinking}
                        onLink={(choice) => linkToEnrolment({ leadId: lead.id, choice })}
                        onDismiss={() => dismissSuggestion(lead.id)}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="space-y-0.5">
                      {lead.email && <div dir="ltr">{lead.email}</div>}
                      {lead.phone && <div dir="ltr">{lead.phone}</div>}
                      {!lead.email && !lead.phone && '—'}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {t(`pages.crm.leads.channel_${lead.channel}`)}
                    {lead.form_id && formNames.get(lead.form_id) && (
                      <span className="block text-xs text-muted-foreground" dir="auto">
                        {t('pages.crm.leads.via_form', { name: formNames.get(lead.form_id) })}
                      </span>
                    )}
                    {lead.campaign && (
                      <span className="block text-xs text-muted-foreground" dir="auto">
                        {lead.campaign}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {lead.interest ?? '—'}
                    <LeadAnswers lead={lead} lang={lang} />
                  </td>
                  <td className="px-3 py-2">
                    <label className="sr-only" htmlFor={`lead-stage-${lead.id}`}>
                      {t('pages.crm.leads.stage')}
                    </label>
                    <select
                      id={`lead-stage-${lead.id}`}
                      className="border rounded px-2 py-1"
                      value={lead.stage}
                      disabled={isUpdatingStage || lead.converted_account_id !== null}
                      onChange={(e) =>
                        updateStage({ id: lead.id, stage: e.target.value as LeadStage })
                      }
                    >
                      {stagesFor(vertical, lead.stage).map((stage) => (
                        <option key={stage} value={stage}>
                          {t(`pages.crm.leads.stage_${stage}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">{formatDate(lead.last_contacted_at, i18n.language)}</td>
                  <td className="px-3 py-2">
                    {formatDate(lead.next_follow_up_at, i18n.language)}
                    {followUpState(lead, today) === 'overdue' && (
                      <span className="block text-xs font-medium text-red-700">{t('pages.crm.leads.overdue')}</span>
                    )}
                    {followUpState(lead, today) === 'today' && (
                      <span className="block text-xs font-medium text-amber-700">{t('pages.crm.leads.due_today')}</span>
                    )}
                  </td>
                  {canConvert && (
                    <td className="px-3 py-2">
                      {lead.converted_account_id ? (
                        <span className="text-xs text-muted-foreground">{t('pages.crm.leads.converted')}</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => setConvertingId(lead.id)}>
                            {t('pages.crm.leads.convert')}
                          </Button>
                          {lead.stage !== 'lost' && <CreateQuoteButton leadId={lead.id} />}
                        </div>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    {isConvertedLead(lead) ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled
                          aria-describedby={`lead-delete-why-${lead.id}`}
                          aria-label={t('pages.crm.leads.delete_named', { name: lead.name })}
                        >
                          {t('pages.crm.leads.delete')}
                        </Button>
                        <span id={`lead-delete-why-${lead.id}`} className="block text-xs text-muted-foreground">
                          {t('pages.crm.leads.delete_blocked_converted')}
                        </span>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isDeleting}
                        aria-label={t('pages.crm.leads.delete_named', { name: lead.name })}
                        onClick={() => handleDelete(lead)}
                      >
                        {t('pages.crm.leads.delete')}
                      </Button>
                    )}
                  </td>
                </tr>
                </LeadRowGroup>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
