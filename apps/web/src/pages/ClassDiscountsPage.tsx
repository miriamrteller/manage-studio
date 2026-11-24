import { useTranslation } from 'react-i18next';
import { ClassDiscountSettings } from '@/features/settings/components/ClassDiscountSettings';
import { ClientDiscountsSection, CouponsSection } from '@/features/settings/components/ClientDiscountsAndCoupons';

/**
 * Finance → Discounts (/admin/finance/discounts), for every studio with the discounts switch on:
 * how discounts add up, per-client discounts and coupon codes (every kind of sale), and for
 * studios with classes the automatic class discounts.
 */
export default function ClassDiscountsPage() {
  const { t } = useTranslation();
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold">{t('settings.tabs.discounts')}</h1>
      <ClassDiscountSettings />
      <ClientDiscountsSection />
      <CouponsSection />
    </div>
  );
}
