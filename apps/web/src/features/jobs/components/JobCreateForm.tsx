import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PersonSearchCombobox } from '@/components/shared';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import { useJobPackages, useJobs } from '../hooks/useJobs';
import { addMinutesLocal, fromDateTimeLocal } from '../lib/jobStatus';
import { PackageSelect } from './PackageSelect';

export type ClientMode = 'existing' | 'new';

/** Client to start the form with (e.g. "New shoot" from a row on the Clients page). */
export interface JobCreatePrefill {
  clientMode?: ClientMode;
  personId?: string;
  personName?: string;
}

interface JobCreateFormProps {
  onCreated?: (engagementId: string) => void;
  prefill?: JobCreatePrefill | null;
}

/** Admin "new shoot": pick/create the client, choose a package and (optionally) a date. */
export function JobCreateForm({ onCreated, prefill = null }: JobCreateFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { labels } = useEntityLabels();
  const { createJob, isCreating } = useJobs();
  const packagesQuery = useJobPackages();

  const prefilledPerson = prefill?.personId ? prefill : null;
  const [mode, setMode] = useState<ClientMode>(
    prefilledPerson ? 'existing' : (prefill?.clientMode ?? 'existing'),
  );
  const [personId, setPersonId] = useState<string | null>(prefilledPerson?.personId ?? null);
  const [personLabel, setPersonLabel] = useState(prefilledPerson?.personName ?? '');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [offeringId, setOfferingId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  // No package picked yet: start from the studio's first one (still editable), so the button is never stuck.
  const firstPackageId = packagesQuery.data?.[0]?.id ?? '';
  useEffect(() => {
    if (firstPackageId) setOfferingId((current) => current || firstPackageId);
  }, [firstPackageId]);

  // The package knows its location and length: fill them in (still editable).
  const selectedPackage = (packagesQuery.data ?? []).find((p) => p.id === offeringId);
  const packageLocation = selectedPackage?.location ?? '';
  const packageMinutes = selectedPackage?.duration_mins ?? null;
  useEffect(() => {
    if (packageLocation) setLocation((current) => current || packageLocation);
  }, [packageLocation]);
  // The end follows the start (start + package length) until the admin sets it themself.
  const [endTouched, setEndTouched] = useState(false);
  useEffect(() => {
    const suggested = addMinutesLocal(startsAt, packageMinutes);
    if (suggested && !endTouched) setEndsAt(suggested);
  }, [startsAt, packageMinutes, endTouched]);

  const canSubmit =
    offeringId !== '' && (mode === 'existing' ? personId !== null : clientName.trim() !== '');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      const engagementId = await createJob({
        offering_id: offeringId,
        person_id: mode === 'existing' ? personId : null,
        client_name: mode === 'new' ? clientName : null,
        client_email: mode === 'new' ? clientEmail : null,
        client_phone: mode === 'new' ? clientPhone : null,
        booked_starts_at: fromDateTimeLocal(startsAt),
        booked_ends_at: fromDateTimeLocal(endsAt),
        location: location || null,
        notes: notes || null,
      });
      onCreated?.(engagementId);
      navigate(`/admin/projects/${engagementId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pages.jobs.error_generic'));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card p-4 space-y-4" aria-label={t('pages.jobs.new')}>
      <h2 className="font-semibold">{t('pages.jobs.new')}</h2>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{labels.account.singular}</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="client-mode" checked={mode === 'existing'} onChange={() => setMode('existing')} />
            {t('pages.jobs.existing_client')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="client-mode" checked={mode === 'new'} onChange={() => setMode('new')} />
            {t('pages.jobs.new_client')}
          </label>
        </div>
        {mode === 'existing' ? (
          <div className="space-y-1">
            <PersonSearchCombobox
              label={t('pages.jobs.client_search')}
              onSelect={(person) => {
                setPersonId(person.id);
                setPersonLabel(person.name);
              }}
            />
            {personLabel && (
              <p className="text-sm" aria-live="polite">
                {labels.account.singular}: <strong>{personLabel}</strong>
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="job-client-name" className="block text-sm font-medium mb-1">
                {t('pages.jobs.client_name')} *
              </label>
              <input id="job-client-name" required className="w-full border rounded px-3 py-2" value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="job-client-email" className="block text-sm font-medium mb-1">
                {t('pages.jobs.client_email')}
              </label>
              <input id="job-client-email" type="email" dir="ltr" className="w-full border rounded px-3 py-2" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
            </div>
            <div>
              <label htmlFor="job-client-phone" className="block text-sm font-medium mb-1">
                {t('pages.jobs.client_phone')}
              </label>
              <input id="job-client-phone" type="tel" dir="ltr" className="w-full border rounded px-3 py-2" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
            </div>
          </div>
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <PackageSelect
          id="job-package"
          label={`${labels.offering.singular} *`}
          packages={packagesQuery.data ?? []}
          value={offeringId}
          onChange={setOfferingId}
          required
        />
        <div>
          <label htmlFor="job-location" className="block text-sm font-medium mb-1">
            {t('pages.jobs.location')}
          </label>
          <input id="job-location" className="w-full border rounded px-3 py-2" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div>
          <label htmlFor="job-starts" className="block text-sm font-medium mb-1">
            {t('pages.jobs.starts_at')}
          </label>
          <input id="job-starts" type="datetime-local" className="w-full border rounded px-3 py-2" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </div>
        <div>
          <label htmlFor="job-ends" className="block text-sm font-medium mb-1">
            {t('pages.jobs.ends_at')}
          </label>
          <input id="job-ends" type="datetime-local" className="w-full border rounded px-3 py-2" value={endsAt} onChange={(e) => {
              setEndTouched(true);
              setEndsAt(e.target.value);
            }} disabled={!startsAt} />
          <p className="text-xs text-muted-foreground mt-1">{t('pages.jobs.ends_hint')}</p>
        </div>
      </div>

      <div>
        <label htmlFor="job-notes" className="block text-sm font-medium mb-1">
          {t('pages.jobs.notes')}
        </label>
        <textarea id="job-notes" rows={2} className="w-full border rounded px-3 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {error && (
        <div className="alert-error" role="alert" aria-live="polite">
          {error}
        </div>
      )}

      <Button type="submit" variant="primary" disabled={!canSubmit || isCreating}>
        {isCreating ? t('pages.jobs.creating') : t('pages.jobs.create')}
      </Button>
    </form>
  );
}
