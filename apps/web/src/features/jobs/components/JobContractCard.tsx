import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useJob } from '../hooks/useJobs';
import type { JobRow } from '../services/jobService';

function formatSignedDate(iso: string, language: string): string {
  try {
    return new Date(iso).toLocaleDateString(language === 'he' ? 'he-IL' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Jerusalem',
    });
  } catch {
    return iso;
  }
}

/**
 * Contract status + "send contract link". Reuses the consent-template /
 * waiver-evidence stack: the active consent template is the contract, merge
 * fields are rendered server-side, and the signed record lands on
 * engagements.waiver_evidence_id.
 */
export function JobContractCard({ job }: { job: JobRow }) {
  const { t, i18n } = useTranslation();
  const { sendContract, isSendingContract, contractError } = useJob(job.engagement_id);
  const [recipient, setRecipient] = useState(job.client_email ?? '');
  const [sentTo, setSentTo] = useState<string | null>(null);

  const signed = Boolean(job.waiver_evidence_id);

  const handleSend = async (event: FormEvent) => {
    event.preventDefault();
    setSentTo(null);
    const email = recipient.trim().toLowerCase();
    if (!email) return;
    try {
      await sendContract(email);
      setSentTo(email);
    } catch {
      // contractError is rendered below
    }
  };

  return (
    <section className="card p-4 space-y-3" aria-labelledby="job-contract-heading">
      <h2 id="job-contract-heading" className="font-semibold">
        {t('pages.jobs.contract')}
      </h2>
      <p className="text-sm">
        {signed ? (
          <span className="inline-block rounded-full px-2 py-0.5 text-xs bg-green-100 text-green-800">
            {job.contract_signed_at
              ? t('pages.jobs.contract_signed_at', { date: formatSignedDate(job.contract_signed_at, i18n.language) })
              : t('pages.jobs.contract_signed')}
          </span>
        ) : (
          <span className="inline-block rounded-full px-2 py-0.5 text-xs bg-amber-100 text-amber-800">
            {t('pages.jobs.contract_unsigned')}
          </span>
        )}
      </p>

      {!signed && job.job_status !== 'cancelled' && (
        <form onSubmit={handleSend} className="space-y-2">
          {!job.client_email && <p className="text-sm text-muted-foreground">{t('pages.jobs.contract_no_email')}</p>}
          <div className="flex flex-wrap items-end gap-2">
            <div className="grow">
              <label htmlFor="job-contract-recipient" className="block text-sm font-medium mb-1">
                {t('pages.jobs.contract_recipient')}
              </label>
              <input
                id="job-contract-recipient"
                type="email"
                dir="ltr"
                required
                className="w-full border rounded px-3 py-2"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              />
            </div>
            <Button type="submit" variant="primary" disabled={isSendingContract || !recipient.trim()}>
              {isSendingContract ? t('pages.jobs.contract_sending') : t('pages.jobs.contract_send')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('pages.jobs.contract_merge_hint')}{' '}
            <Link to="/admin/setup/waivers" className="underline">
              {t('nav.contracts')}
            </Link>
          </p>
          <div aria-live="polite">
            {sentTo && <p className="text-sm text-success">{t('pages.jobs.contract_sent', { email: sentTo })}</p>}
            {contractError && (
              <div className="alert-error" role="alert">
                {contractError.message}
              </div>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
