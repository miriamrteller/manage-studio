import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { PROOF_METHODS, type PayDirectMethod } from '@/features/jobs/services/clientPhotoShopService';
import { formatDueDate, formatMinor } from '@/features/jobs/lib/jobPaymentFormat';
import { payWaysLabel } from '@/features/jobs/lib/payDirectLabel';
import { PayDirectError, PayDirectService, type PayDirectTarget } from './payDirectService';

/**
 * "Pay the studio directly" on any payment page (owner, 23 Nov 2026): the ways the studio
 * switched on in Settings › Online payments (Bit, bank transfer, cash, cheque). The client
 * picks one and sees its details. Bit / bank transfer: they can send a screenshot of the
 * payment. Cash / cheque: they confirm. Never required, never blocks: card (when the studio
 * has it) stays right there, and the studio records the payment as before.
 * Shows nothing when the studio has no ways switched on.
 */
export function PayDirectChoice({
  target,
  alsoOnline = false,
}: {
  target: PayDirectTarget;
  /** The page also offers card: the heading reads "Or pay the studio directly". */
  alsoOnline?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const headingId = useId();
  const wayId = useId();
  const fileId = useId();
  const key = ['pay-direct', target] as const;
  const view = useQuery({ queryKey: key, queryFn: () => PayDirectService.get(target), retry: false });
  const data = view.data;
  const allWays = data?.ways ?? [];
  const ways = allWays.map((w) => w.method);
  const [chosen, setChosen] = useState<PayDirectMethod | null>(null);
  const saved = data?.chosen ?? null;
  const way: PayDirectMethod | null =
    chosen && ways.includes(chosen) ? chosen : saved && ways.includes(saved) ? saved : ways[0] ?? null;
  const details = allWays.find((w) => w.method === way)?.details ?? null;
  const needsProof = way !== null && PROOF_METHODS.includes(way);

  const confirm = useMutation({
    mutationFn: (method: PayDirectMethod) => PayDirectService.choose(target, method),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const send = useMutation({
    mutationFn: (file: File) => PayDirectService.sendProof(target, file, way ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  if (!data || !data.payable || ways.length === 0 || !way) return null;

  const failed = send.error ?? confirm.error;
  const error = failed instanceof PayDirectError ? failed.code : failed ? 'server_error' : null;
  const money = formatMinor(data.amountMinor, data.currency, i18n.language);

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 text-start">
      <h2 id={headingId} className="text-base font-semibold text-foreground">
        {alsoOnline ? t('pay_direct.title_or') : t('pay_direct.title')}
      </h2>

      {ways.length > 1 ? (
        <fieldset className="space-y-2 text-sm">
          <legend className="font-medium">{t('pay_direct.choose')}</legend>
          <div className="flex flex-wrap gap-4">
            {ways.map((w) => (
              <label key={w} className="flex items-center gap-2">
                <input type="radio" name={wayId} value={w} checked={way === w} onChange={() => setChosen(w)} />
                {payWaysLabel(t, [w])}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="text-sm font-medium">{payWaysLabel(t, [way])}</p>
      )}

      <div className="space-y-1 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
        <p className="font-medium">{t('pay_direct.amount', { price: money })}</p>
        {way === 'bit' && details && <p dir="auto">{t('pay_direct.bit_to', { phone: details })}</p>}
        {way === 'bank' && <p>{t('pay_direct.bank_to')}</p>}
        {way !== 'bit' && details && <p className="whitespace-pre-line" dir="auto">{details}</p>}
      </div>

      {needsProof ? (
        <div className="space-y-2 text-sm">
          {data.proofSentAt ? (
            <p role="status" className="text-green-800">
              {t('pay_direct.proof_sent', { date: formatDueDate(data.proofSentAt, i18n.language) })}
            </p>
          ) : (
            <p className="text-gray-700">{t('pay_direct.proof_ask')}</p>
          )}
          <label
            htmlFor={fileId}
            className="inline-flex cursor-pointer items-center rounded-md border border-gray-300 bg-white px-3 py-2 font-medium focus-within:ring-2 focus-within:ring-primary"
          >
            {data.proofSentAt ? t('pay_direct.proof_replace') : t('pay_direct.proof_send')}
            <input
              id={fileId}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={send.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) send.mutate(file);
              }}
            />
          </label>
          {send.isPending && <p role="status" className="text-gray-600">{t('pay_direct.proof_sending')}</p>}
        </div>
      ) : saved === way ? (
        <p role="status" className="text-sm text-green-800">
          {t('pay_direct.confirmed', { how: payWaysLabel(t, [way]) })}
        </p>
      ) : (
        <Button variant="primary" isLoading={confirm.isPending} onClick={() => confirm.mutate(way)}>
          {t('pay_direct.confirm')}
        </Button>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {t(`pay_direct.errors.${error}`, { defaultValue: t('pay_direct.errors.server_error') })}
        </p>
      )}
      <p className="text-xs text-gray-500">{t('pay_direct.next')}</p>
    </section>
  );
}
