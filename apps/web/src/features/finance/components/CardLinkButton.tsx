import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { cardLinkSupported } from '@/lib/providerPairing';
import { parseFunctionInvokeBody } from '@/lib/parseFunctionInvokeError';

const KNOWN_ERRORS = ['card_already_saved', 'card_link_unsupported', 'no_monthly_plan'] as const;

/**
 * Active monthly enrolment → "Send card link" (payments B b). Emails the parent a link to pay
 * the month that is due by card and save the card; later months are then charged to it.
 * Grow only. With YPay or Invoice4U it says that saving a card is not available yet, and the
 * studio records monthly payments by hand. Pay-at-the-studio studios see nothing.
 */
export function CardLinkButton({ engagementId, paymentProvider }: {
  engagementId: string;
  paymentProvider: string | null | undefined;
}) {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('send-card-link', {
        body: { engagement_id: engagementId },
      });
      const body = (await parseFunctionInvokeBody(data, error)) as
        | { ok?: boolean; emailSent?: boolean; warning?: string; error?: string; code?: string }
        | null;
      if (!body || body.error || !body.ok) {
        throw Object.assign(new Error(body?.error ?? t('finance.card_link.error_generic')), { code: body?.code });
      }
      return body;
    },
    onSuccess: (body) => {
      setMessage(
        body.emailSent
          ? t('finance.card_link.sent')
          : t('finance.card_link.not_emailed', { reason: body.warning ?? '' }),
      );
    },
    onError: (err: Error & { code?: string }) => {
      const code = KNOWN_ERRORS.find((c) => c === err.code || err.message.includes(c));
      setMessage(code ? t(`finance.card_link.error_${code}`) : err.message);
    },
  });

  if (paymentProvider === 'offline' || !paymentProvider) return null;

  if (!cardLinkSupported(paymentProvider)) {
    return (
      <p className="text-sm text-muted-foreground" role="note">
        {t('finance.card_link.unsupported', {
          provider: t(`settings.offline_payments.providers.${paymentProvider}`, { defaultValue: paymentProvider }),
        })}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={send.isPending}
        isLoading={send.isPending}
        aria-describedby={`card-link-hint-${engagementId}`}
        onClick={() => send.mutate()}
      >
        {t('finance.card_link.send')}
      </Button>
      <p id={`card-link-hint-${engagementId}`} className="text-xs text-muted-foreground">
        {t('finance.card_link.hint')}
      </p>
      {message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
