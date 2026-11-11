import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useEntityLabels } from '@/hooks/useEntityLabels';
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
export function ConvertLeadPanel({ leadId, leadName, defaultOfferingId, defaultLocation, eventDate, onClose }: ConvertLeadPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { labels } = useEntityLabels();
  const packagesQuery = useJobPackages();
  const convert = useConvertLead();

  const [offeringId, setOfferingId] = useState(defaultOfferingId ?? '');
  const [startsAt, setStartsAt] = useState(() => eventDateToLocal(eventDate));
  const [location, setLocation] = useState(defaultLocation ?? '');

  // No location from the enquiry: use the package's own, when it has one.
  const packageLocation = (packagesQuery.data ?? []).find((p) => p.id === offeringId)?.location ?? '';
  useEffect(() => {
    if (packageLocation) setLocation((current) => current || packageLocation);
  }, [packageLocation]);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!offeringId) return;
    setError(null);
    try {
      const engagementId = await convert.mutateAsync({
        lead_id: leadId,
        offering_id: offeringId,
        booked_starts_at: fromDateTimeLocal(startsAt),
        location: location || null,
      });
      // Straight into a quote for the new shoot: the studio checks the price, and
      // sending / accepting it emails the client the details and the pay link.
      navigate(`/admin/quotes/new?engagement=${engagementId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pages.jobs.error_generic'));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card p-4 space-y-3 bg-muted" aria-label={t('pages.crm.leads.convert')}>
      <h3 className="font-semibold">
        {t('pages.crm.leads.convert')}: {leadName}
      </h3>
      <p className="text-sm text-muted-foreground">{t('pages.crm.leads.convert_hint')}</p>
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
        <Button type="submit" variant="primary" disabled={!offeringId || convert.isPending}>
          {convert.isPending ? t('pages.jobs.creating') : t('pages.crm.leads.convert')}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
