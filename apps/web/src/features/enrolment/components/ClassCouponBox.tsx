import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { parseFunctionInvokeBody } from '@/lib/parseFunctionInvokeError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CheckoutChargePayload, ClassCouponResult } from '../lib/checkoutBootstrapTypes';

/**
 * "Have a coupon code?": optional and never in the way. A code that doesn't work
 * says why and the client pays as before. `onApply` sends the code and returns the
 * answer (null when it couldn't be checked).
 */
export function CouponCodeBox({ onApply }: { onApply: (code: string) => Promise<ClassCouponResult | null> }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        className="text-sm underline text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        {t('class_discounts.coupon_open')}
      </button>
    );
  }

  const apply = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const coupon = await onApply(code.trim());
      if (!coupon) setMessage({ ok: false, text: t('class_discounts.coupon_reason_error') });
      else if (coupon.ok) setMessage({ ok: true, text: t('class_discounts.coupon_applied') });
      else setMessage({ ok: false, text: t(`class_discounts.coupon_reason_${coupon.reason}`) });
    } catch {
      setMessage({ ok: false, text: t('class_discounts.coupon_reason_error') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-1" onSubmit={apply} data-testid="class-coupon-box">
      <label htmlFor="class-coupon-code" className="text-sm font-medium">
        {t('class_discounts.coupon_label')}
      </label>
      <div className="flex gap-2">
        <Input
          id="class-coupon-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          dir="ltr"
          className="max-w-[12rem]"
        />
        <Button type="submit" variant="outline" size="sm" disabled={busy || !code.trim()}>
          {busy ? t('common.loading') : t('class_discounts.coupon_apply')}
        </Button>
      </div>
      {message && (
        <p
          className={message.ok ? 'text-sm text-green-800' : 'text-sm text-muted-foreground'}
          role="status"
        >
          {message.text}
        </p>
      )}
    </form>
  );
}

/**
 * The coupon box on enrolment and booking checkout, shown only when the studio has
 * coupons. A code that works gives a new charge at the lower price.
 */
export function ClassCouponBox({
  classId,
  engagementId,
  enrolmentToken,
  onCharge,
}: {
  classId: string;
  engagementId: string;
  enrolmentToken?: string;
  onCharge: (charge: CheckoutChargePayload) => void;
}) {
  const onApply = async (code: string): Promise<ClassCouponResult | null> => {
    const { data, error } = await supabase.functions.invoke('create-checkout', {
      body: {
        offering_id: classId,
        engagement_id: engagementId,
        coupon_code: code,
        ...(enrolmentToken ? { enrolment_token: enrolmentToken } : {}),
      },
      ...(enrolmentToken ? { headers: { Authorization: `WaiverToken ${enrolmentToken}` } } : {}),
    });
    const parsed = (await parseFunctionInvokeBody(data, error)) as
      | (CheckoutChargePayload & { coupon?: ClassCouponResult; error?: string })
      | null;
    if (error || !parsed || parsed.error || !parsed.coupon) return null;
    if (parsed.coupon.ok) onCharge(parsed);
    return parsed.coupon;
  };
  return <CouponCodeBox onApply={onApply} />;
}
