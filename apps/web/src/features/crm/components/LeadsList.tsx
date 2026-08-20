import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared';
import { useTenant } from '@/hooks/useTenant';
import { useLeads } from '../hooks/useLeads';
import { LEAD_CHANNELS, LEAD_STAGES, type LeadChannel, type LeadStage } from '../services/leadService';

/**
 * Admin leads page: capture-links panel (the tenant's self-onboarding —
 * copy-paste plumbing, no platform ops), a manual "new lead" form for
 * walk-ins/phone/WhatsApp inquiries, and the pipeline list with inline stage
 * updates. Leads are a separate entity from students/families by design.
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

function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions/http) — the value is still selectable.
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium min-w-32">{label}</span>
      <code className="text-xs bg-muted border rounded px-2 py-1 break-all" dir="ltr">{value}</code>
      <Button variant="outline" size="sm" onClick={copy}>
        {copied ? t('pages.crm.leads.copied') : t('common.copy')}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? t('pages.crm.leads.copied') : ''}
      </span>
    </div>
  );
}

export function LeadsList() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const { leads, isLoading, error, createLead, isCreating, updateStage, isUpdatingStage } =
    useLeads();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [channel, setChannel] = useState<LeadChannel>('website');
  const [interest, setInterest] = useState('');
  const [note, setNote] = useState('');
  const [followUp, setFollowUp] = useState('');

  const captureLinks = useMemo(() => {
    if (!tenant?.subdomain) return null;
    // The admin is already on the tenant's own portal, so the current origin
    // IS the tenant site — no per-tenant config needed (self-onboard rule).
    const formUrl = `${window.location.origin}/inquire`;
    // The lead inbox lives on the PLATFORM email domain (Email Routing catch-all
    // → lead-email-ingest worker), which equals the production root domain. Dev
    // sets VITE_APP_ROOT_DOMAIN to a localhost origin for link-building, which
    // is never an email domain — guard and fall back to the platform constant.
    const rootDomain: string = import.meta.env.VITE_APP_ROOT_DOMAIN || '';
    const emailDomain =
      rootDomain && !rootDomain.includes('localhost') && !rootDomain.includes(':')
        ? rootDomain
        : 'opalswift.com';
    return {
      email: `leads-${tenant.subdomain}@${emailDomain}`,
      form: formUrl,
      instagram: `${formUrl}?src=instagram`,
      whatsapp: `${formUrl}?src=whatsapp`,
      linkedin: `${formUrl}?src=linkedin`,
    };
  }, [tenant?.subdomain]);

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
      <p className="text-sm text-muted-foreground">{t('pages.crm.leads.description')}</p>

      {captureLinks && (
        <section aria-labelledby="capture-links-heading" className="card p-4 space-y-3">
          <h2 id="capture-links-heading" className="font-semibold">
            {t('pages.crm.leads.capture_title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('pages.crm.leads.capture_hint')}</p>
          <CopyField label={t('pages.crm.leads.capture_email')} value={captureLinks.email} />
          <CopyField label={t('pages.crm.leads.capture_form')} value={captureLinks.form} />
          <CopyField label={t('pages.crm.leads.capture_instagram')} value={captureLinks.instagram} />
          <CopyField label={t('pages.crm.leads.capture_whatsapp')} value={captureLinks.whatsapp} />
          <CopyField label={t('pages.crm.leads.capture_linkedin')} value={captureLinks.linkedin} />
        </section>
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
      {error && (
        <div className="alert-error" role="alert">
          {error.message}
        </div>
      )}

      {!isLoading && leads.length === 0 && (
        <EmptyState title={t('pages.crm.leads.empty_title')} message={t('pages.crm.leads.empty_message')} />
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
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td className="px-3 py-2 font-medium">
                    {lead.name}
                    {lead.converted_account_id && (
                      <span className="ms-2 text-xs text-muted-foreground">
                        {t('pages.crm.leads.converted')}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="space-y-0.5">
                      {lead.email && <div dir="ltr">{lead.email}</div>}
                      {lead.phone && <div dir="ltr">{lead.phone}</div>}
                      {!lead.email && !lead.phone && '—'}
                    </div>
                  </td>
                  <td className="px-3 py-2">{t(`pages.crm.leads.channel_${lead.channel}`)}</td>
                  <td className="px-3 py-2">{lead.interest ?? '—'}</td>
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
                      {LEAD_STAGES.map((stage) => (
                        <option key={stage} value={stage}>
                          {t(`pages.crm.leads.stage_${stage}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">{formatDate(lead.last_contacted_at, i18n.language)}</td>
                  <td className="px-3 py-2">{formatDate(lead.next_follow_up_at, i18n.language)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
