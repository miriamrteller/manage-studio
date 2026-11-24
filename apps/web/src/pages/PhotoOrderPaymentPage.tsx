import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  ClientPhotoShopError,
  ClientPhotoShopService,
  payDirectWays,
  PROOF_METHODS,
  type PayDirectMethod,
} from '@/features/jobs/services/clientPhotoShopService';
import { formatDueDate, formatMinor } from '@/features/jobs/lib/jobPaymentFormat';
import { payWaysLabel } from '@/features/jobs/lib/payDirectLabel';

/**
 * The payment page of one photo order (owner, 22 Nov 2026): after sending the order from the
 * gallery, the client picks one of the ways the studio switched on (Bit, bank transfer, cash,
 * cheque), sees its details, and pays. Bit / bank transfer: the client sends a screenshot of
 * the payment here. Cash / cheque: the client confirms. Never required: the order waits for
 * the studio to record the payment either way.
 * Also opened from the order email and the reminders. Route: /dashboard/portal/photo-order/:engagementId/:orderId
 */
export default function PhotoOrderPaymentPage() {
  const { t, i18n } = useTranslation();
  const { engagementId = '', orderId = '' } = useParams();
  const queryClient = useQueryClient();
  const headingId = useId();
  const wayId = useId();
  const fileId = useId();
  const key = ['photo-order-payment', engagementId, orderId] as const;
  const page = useQuery({
    queryKey: key,
    queryFn: () => ClientPhotoShopService.payment(engagementId, orderId),
    enabled: Boolean(engagementId && orderId),
  });
  const data = page.data;
  const allWays = data ? payDirectWays(data) : [];
  const ways = allWays.map((w) => w.method);
  const [chosen, setChosen] = useState<PayDirectMethod | null>(null);
  const saved = data?.order.pay_method ?? null;
  const way: PayDirectMethod | null =
    chosen && ways.includes(chosen) ? chosen : saved && ways.includes(saved) ? saved : ways[0] ?? null;
  const details = allWays.find((w) => w.method === way)?.details ?? null;
  const needsProof = way !== null && PROOF_METHODS.includes(way);

  const confirm = useMutation({
    mutationFn: (method: PayDirectMethod) => ClientPhotoShopService.chooseMethod(engagementId, orderId, method),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const send = useMutation({
    mutationFn: (file: File) => ClientPhotoShopService.sendProof(engagementId, orderId, file, way ?? undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: key });
      await queryClient.invalidateQueries({ queryKey: ['client-photo-shop', engagementId] });
    },
  });
  const failed = send.error ?? confirm.error;
  const error = failed instanceof ClientPhotoShopError ? failed.code : failed ? 'server_error' : null;

  const back = (
    <Link to="/dashboard/portal" className="text-sm font-medium underline">
      {t('pages.client_portal.photo_shop.payment_back')}
    </Link>
  );

  if (page.isLoading) return <div role="status" aria-live="polite">{t('common.loading')}</div>;
  if (page.isError || !data) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-red-700">{t('pages.client_portal.photo_shop.payment_not_found')}</p>
        {back}
      </div>
    );
  }

  const o = data.order;
  const waiting = o.status === 'awaiting_payment';
  const money = formatMinor(o.total_minor, o.currency, i18n.language);

  return (
    <section aria-labelledby={headingId} className="mx-auto max-w-lg space-y-5">
      {back}
      <div className="space-y-1">
        <h1 id={headingId} className="text-xl font-semibold text-gray-900">
          {t('pages.client_portal.photo_shop.payment_title')}
        </h1>
        <p className="text-sm text-gray-600">
          {[data.studioName, formatDueDate(o.created_at, i18n.language), t('pages.client_portal.photo_shop.order_photos', { count: o.photo_count }), money]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      {!waiting ? (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {t('pages.client_portal.photo_shop.payment_recorded')}
        </p>
      ) : (
        <>
          {ways.length > 1 ? (
            <fieldset className="space-y-2 text-sm">
              <legend className="font-medium">{t('pages.client_portal.photo_shop.payment_choose')}</legend>
              <div className="flex flex-wrap gap-4">
                {ways.map((w) => (
                  <label key={w} className="flex items-center gap-2">
                    <input type="radio" name={wayId} value={w} checked={way === w} onChange={() => setChosen(w)} />
                    {payWaysLabel(t, [w])}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : way ? (
            <p className="text-sm font-medium">{payWaysLabel(t, [way])}</p>
          ) : (
            <p className="text-sm">{t('pages.client_portal.photo_shop.pay_direct_only')}</p>
          )}

          {way && (
            <div className="space-y-1 rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-800">
              <p className="font-medium">{t('pages.client_portal.photo_shop.payment_amount', { price: money })}</p>
              {way === 'bit' && details && <p>{t('pages.client_portal.photo_shop.bit_to', { phone: details })}</p>}
              {way === 'bank' && <p>{t('pages.client_portal.photo_shop.bank_to')}</p>}
              {way !== 'bit' && details && <p className="whitespace-pre-line">{details}</p>}
            </div>
          )}

          {needsProof ? (
            <div className="space-y-2 text-sm">
              <h2 className="font-medium">{t('pages.client_portal.photo_shop.proof_heading')}</h2>
              {o.proof_sent_at ? (
                <p role="status" className="text-green-800">
                  {t('pages.client_portal.photo_shop.proof_sent', { date: formatDueDate(o.proof_sent_at, i18n.language) })}
                </p>
              ) : (
                <p className="text-gray-700">{t('pages.client_portal.photo_shop.proof_ask')}</p>
              )}
              <label htmlFor={fileId} className="inline-flex cursor-pointer items-center rounded-md border border-gray-300 bg-white px-3 py-2 font-medium">
                {o.proof_sent_at ? t('pages.client_portal.photo_shop.proof_replace') : t('pages.client_portal.photo_shop.proof_send')}
              </label>
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
              {send.isPending && <p role="status" className="text-gray-600">{t('pages.client_portal.photo_shop.proof_sending')}</p>}
            </div>
          ) : way ? (
            <div className="space-y-2 text-sm">
              {saved === way ? (
                <p role="status" className="text-green-800">
                  {t('pages.client_portal.photo_shop.payment_confirmed', { how: payWaysLabel(t, [way]) })}
                </p>
              ) : (
                <Button variant="primary" isLoading={confirm.isPending} onClick={() => confirm.mutate(way)}>
                  {t('pages.client_portal.photo_shop.payment_confirm')}
                </Button>
              )}
            </div>
          ) : null}
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {t(`pages.client_portal.photo_shop.errors.${error}`, {
                defaultValue: t('pages.client_portal.photo_shop.errors.server_error'),
              })}
            </p>
          )}

          {data.card_payments && o.pay_token && (
            <p className="text-sm">
              <a href={`/pay/${o.pay_token}`} className="font-medium underline">
                {t('pages.client_portal.photo_shop.pay_online_instead')}
              </a>
            </p>
          )}
          <p className="text-xs text-gray-500">{t('pages.client_portal.photo_shop.payment_next')}</p>
        </>
      )}
    </section>
  );
}
