import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { isPhoneBrowser } from '@/lib/tenantProviderRouting';

/**
 * Takbull on a phone: "Pay with Bit" asks for a Bit order (PaymentMethodType 21, IsMobile) and
 * opens the link Takbull returns, which opens the Bit app. The card page stays below it. Takbull's
 * notice settles the payment either way. Nothing is shown off a phone.
 */
export function TakbullBitButton({
  classId,
  engagementId,
  enrolmentToken,
}: {
  classId: string;
  engagementId: string;
  enrolmentToken?: string;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isPhoneBrowser()) return null;

  const payWithBit = async () => {
    setBusy(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke('create-checkout', {
      body: {
        offering_id: classId,
        engagement_id: engagementId,
        ...(enrolmentToken ? { enrolment_token: enrolmentToken } : {}),
        pay_with: 'bit',
        is_mobile: true,
      },
      ...(enrolmentToken ? { headers: { Authorization: `WaiverToken ${enrolmentToken}` } } : {}),
    });
    const pageUrl = (data as { pageUrl?: unknown } | null)?.pageUrl;
    if (invokeError || typeof pageUrl !== 'string' || !pageUrl) {
      setBusy(false);
      setError(t('enrolment.takbull_bit_failed'));
      return;
    }
    window.location.assign(pageUrl);
  };

  return (
    <div className="space-y-2">
      <Button type="button" variant="primary" fullWidth isLoading={busy} onClick={() => void payWithBit()}>
        {t('enrolment.takbull_pay_with_bit')}
      </Button>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
