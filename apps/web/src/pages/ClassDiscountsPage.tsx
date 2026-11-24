import { useTranslation } from 'react-i18next';
import { ClassDiscountSettings } from '@/features/settings/components/ClassDiscountSettings';
import { ClientDiscountsSection, CouponsSection } from '@/features/settings/components/ClientDiscountsAndCoupons';
import { useTenant } from '@/hooks/useTenant';

/** Classes → Discounts (/admin/classes/discounts): automatic discounts, per-client discounts and coupon codes. */
export default function ClassDiscountsPage() {
  const { t } = useTranslation();
  const tenant = useTenant();
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold">{t('settings.tabs.discounts')}</h1>
      <ClassDiscountSettings />
      {tenant?.profile?.teachesClasses && (
        <>
          <ClientDiscountsSection />
          <CouponsSection />
        </>
      )}
    </div>
  );
}
