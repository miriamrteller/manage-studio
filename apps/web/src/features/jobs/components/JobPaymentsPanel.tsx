import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useJobPaymentRequests } from '../hooks/useJobPaymentRequests';
import { JOB_CONTACT_SELECT, jobContactFromRow, type JobContact, type JobContactRow } from '../lib/jobContact';
import { formatMinor, isoDateInJerusalem } from '../lib/jobPaymentFormat';
import type { JobPaymentRequest } from '../services/jobPaymentService';
import { JobGalleryGate } from './JobGalleryGate';
import { JobPaymentRequestForm } from './JobPaymentRequestForm';
import { JobPaymentRequestRow } from './JobPaymentRequestRow';
import { ManualPaymentDialog, type ManualAction } from './ManualPaymentDialog';

interface Props {
  engagementId: string;
}

/**
 * Slot component rendered by Thread A's job (shoot) page.
 * Deposit/balance requests, pay links (email + WhatsApp), manual cash/bank
 * payments, manual refunds, invoice links, and the gallery gate.
 */
export function JobPaymentsPanel({ engagementId }: Props) {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const language = i18n.language;
  const currency = tenant?.currency ?? 'ILS';
  const { requests, isLoading, error, create, setStatus, sendLink, recordManualPayment, recordManualRefund } =
    useJobPaymentRequests(engagementId);
  const [showForm, setShowForm] = useState(false);
  const [manual, setManual] = useState<ManualAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const contactQuery = useQuery({
    queryKey: ['job-contact', engagementId],
    queryFn: async (): Promise<JobContact> => {
      const { data } = await supabase
        .from('engagements')
        .select(JOB_CONTACT_SELECT)
        .eq('id', engagementId)
        .maybeSingle();
      return jobContactFromRow(data as JobContactRow | null);
    },
  });

  const busy = sendLink.isPending || setStatus.isPending || recordManualPayment.isPending || recordManualRefund.isPending;
  const outstanding = requests
    .filter((r) => r.status === 'pending' || r.status === 'sent')
    .reduce((sum, r) => sum + r.amount_minor, 0);
  const paid = requests.filter((r) => r.status === 'paid').reduce((sum, r) => sum + r.amount_minor, 0);

  const handleSend = async (r: JobPaymentRequest) => {
    setNotice(null);
    try {
      const res = await sendLink.mutateAsync(r.id);
      setNotice(t('pages.jobs.payments.linkSentTo', { email: res.recipientEmail }));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t('errors.generic'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('pages.jobs.payments.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t('pages.jobs.payments.summary', {
            paid: formatMinor(paid, currency, language),
            outstanding: formatMinor(outstanding, currency, language),
          })}
        </p>
        {isLoading && <p className="text-sm">{t('common.loading')}</p>}
        {error && <p role="alert" className="text-sm text-error">{error.message}</p>}
        {!isLoading && requests.length === 0 && !showForm && (
          <p className="text-sm text-muted-foreground">{t('pages.jobs.payments.empty')}</p>
        )}
        <ul className="divide-y">
          {requests.map((r) => (
            <JobPaymentRequestRow
              key={r.id}
              request={r}
              language={language}
              clientPhone={contactQuery.data?.phone ?? null}
              studioName={tenant?.name ?? ''}
              busy={busy}
              onSendLink={() => void handleSend(r)}
              onMarkPaid={() => setManual({ kind: 'mark_paid', request: r })}
              onRefund={() => setManual({ kind: 'refund', request: r })}
              onCancel={() => setStatus.mutate({ id: r.id, status: 'cancelled' })}
              onReopen={() => setStatus.mutate({ id: r.id, status: 'pending' })}
            />
          ))}
        </ul>
        {notice && <p aria-live="polite" className="text-sm">{notice}</p>}
        {showForm ? (
          <JobPaymentRequestForm
            currency={currency}
            jobDate={isoDateInJerusalem(contactQuery.data?.bookedStartsAt)}
            isSubmitting={create.isPending}
            onCancel={() => setShowForm(false)}
            onSubmit={async (reqs) => {
              await create.mutateAsync(reqs);
              setShowForm(false);
            }}
          />
        ) : (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            {t('pages.jobs.payments.add')}
          </Button>
        )}
        <JobGalleryGate engagementId={engagementId} currency={currency} language={language} />
      </CardContent>
      <ManualPaymentDialog
        action={manual}
        language={language}
        isSubmitting={recordManualPayment.isPending || recordManualRefund.isPending}
        onClose={() => setManual(null)}
        onMarkPaid={(id, method, note) => recordManualPayment.mutateAsync({ id, method, note })}
        onRefund={(paymentId, reason) => recordManualRefund.mutateAsync({ paymentId, reason })}
      />
    </Card>
  );
}

export default JobPaymentsPanel;
