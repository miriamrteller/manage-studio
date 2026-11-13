import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import { useTenant } from '@/hooks/useTenant';
import { sendShootRequestQuote } from '@/features/quotes/services/sendShootRequestQuote';
import { useConvertLead, useJobPackages } from '../hooks/useJobs';
import { fromDateTimeLocal } from '../lib/jobStatus';
import { PackageSelect } from './PackageSelect';

interface ConvertLeadPanelProps {
  leadId: string;
  leadName: string;
  /** Offering the lead asked about, preselected when present. */
  defaultOfferingId?: string | null;
  /** From the enquiry form, prefilled when present. */
  defaultLocation?: string | null;
  /** Event date from the enquiry form: prefills the date (10:00, editable) and shows as a hint. */
  eventDate?: string | null;
  /** A shoot request (package + day from the Book page): worded as Confirm. */
  confirming?: boolean;
  onClose: () => void;
}

/** An enquiry's event date (YYYY-MM-DD) as a datetime-local value at 10:00; anything else stays blank. */
export function eventDateToLocal(eventDate: string | null | undefined): string {
  const date = /^\d{4}-\d{2}-\d{2}/.exec((eventDate ?? '').trim())?.[0];
  return date ? `${date}T10:00` : '';
}

/**
 * Inline "convert lead → job" form: pick the package, optional date/location,
 * then one RPC (convert_lead_to_job) creates client + engagement + job_details
 * and marks the lead converted. Opens a quote for the new shoot on success.
 */
export function ConvertLeadPanel({
  leadId,
  leadName,
  defaultOfferingId,
  defaultLocation,
  eventDate,
  confirming = false,
  onClose,
}: ConvertLeadPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { labels } = useEntityLabels();
  const tenant = useTenant();
  const [sendingQuote, setSendingQuote] = useState(false);
  const packagesQuery = useJobPackages();
  const convert = useConvertLead();

  const [offeringId, setOfferingId] = useState(defaultOfferingId ?? '');
  const [startsAt, setStartsAt] = useState(() => eventDateToLocal(eventDate));
  const [location, setLocation] = useState(defaultLocation ?? '');

  // No package picked yet: start from the studio's first one (still editable), so the button is never stuck.
  const firstPackageId = packagesQuery.data?.[0]?.id ?? '';
  useEffect(() => {
    if (firstPackageId) setOfferingId((current) => current || firstPackageId);
  }, [firstPackageId]);

  // No location from the enquiry: use the package's own, when it has one.
  const packageLocation = (packagesQuery.data ?? []).find((p) => p.id === offeringId)?.location ?? '';
  useEffect(() => {
    if (packageLocation) setLocation((current) => current || packageLocation);
  }, [packageLocation]);
  const [error, setError] = useState<string | null>(null);
  const actionLabel = confirming ? t('pages.crm.leads.confirm_shoot') : t('pages.crm.leads.convert');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!offeringId) return;
    setError(null);
    try {
      const bookedStartsAt = fromDateTimeLocal(startsAt);
      const engagementId = await convert.mutateAsync({
        lead_id: leadId,
        offering_id: offeringId,
        booked_starts_at: bookedStartsAt,
        location: location || null,
      });
      // A shoot request: the shoot is booked, and the quote goes to the client
      // straight away to accept and pay the deposit (owner, 13 Nov 2026). If
      // that cannot be done, the shoot stays booked and the quote opens here.
      if (confirming && tenant) {
        setSendingQuote(true);
        try {
          const { quoteId } = await sendShootRequestQuote({
            tenantId: tenant.id,
            emailLanguage: tenant.language_default ?? 'he',
            engagementId,
            offeringId,
            clientName: leadName,
            bookedStartsAt,
          });
          if (quoteId) {
            navigate(`/admin/projects/quotes/${quoteId}`);
            return;
          }
        } catch {
          // Fall through to a new quote for this shoot.
        } finally {
          setSendingQuote(false);
        }
      }
      // Straight into a quote for the new shoot: the studio checks the price, and
      // sending / accepting it emails the client the details and the pay link.
      navigate(`/admin/projects/quotes/new?engagement=${engagementId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pages.jobs.error_generic'));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card p-4 space-y-3 bg-muted" aria-label={actionLabel}>
      <h3 className="font-semibold">
        {actionLabel}: {leadName}
      </h3>
      <p className="text-sm text-muted-foreground">
        {confirming ? t('pages.crm.leads.confirm_hint') : t('pages.crm.leads.convert_hint')}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <PackageSelect
          id={`convert-package-${leadId}`}
          label={`${labels.offering.singular} *`}
          packages={packagesQuery.data ?? []}
          value={offeringId}
          onChange={setOfferingId}
          required
        />
        <div>
          <label htmlFor={`convert-starts-${leadId}`} className="block text-sm font-medium mb-1">
            {t('pages.jobs.starts_at')}
          </label>
          <input
            id={`convert-starts-${leadId}`}
            type="datetime-local"
            className="w-full border rounded px-3 py-2"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            aria-describedby={eventDate ? `convert-starts-hint-${leadId}` : undefined}
          />
          {eventDate && (
            <p id={`convert-starts-hint-${leadId}`} className="text-xs text-muted-foreground mt-1">
              {t('pages.crm.leads.event_date_hint', { date: eventDate })}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`convert-location-${leadId}`} className="block text-sm font-medium mb-1">
            {t('pages.jobs.location')}
          </label>
          <input
            id={`convert-location-${leadId}`}
            className="w-full border rounded px-3 py-2"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
      </div>
      {error && (
        <div className="alert-error" role="alert" aria-live="polite">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={!offeringId || convert.isPending || sendingQuote}>
          {convert.isPending || sendingQuote ? t('pages.jobs.creating') : actionLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
