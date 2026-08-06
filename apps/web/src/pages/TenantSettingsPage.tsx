import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Paintbrush, Building2, Globe, CreditCard, FileText } from 'lucide-react';

import { SettingsLayout, type SettingsSection } from '@/features/settings/components/SettingsLayout';
import { BrandingSettingsForm } from '@/features/settings/components/BrandingSettingsForm';
import { SchoolProfileForm } from '@/features/settings/components/SchoolProfileForm';
import { LocaleSettingsForm } from '@/features/settings/components/LocaleSettingsForm';
import { PaymentSettingsForm } from '@/features/settings/components/PaymentSettingsForm';
import { InvoicingSettingsForm } from '@/features/settings/components/InvoicingSettingsForm';

const SECTIONS: SettingsSection[] = [
  {
    id: 'branding',
    label: 'Branding',
    labelHe: 'מיתוג',
    icon: Paintbrush,
    component: BrandingSettingsForm,
  },
  {
    id: 'profile',
    label: 'School Profile',
    labelHe: 'פרופיל בית הספר',
    icon: Building2,
    component: SchoolProfileForm,
  },
  {
    id: 'locale',
    label: 'Language & Region',
    labelHe: 'שפה ואזור',
    icon: Globe,
    component: LocaleSettingsForm,
  },
  {
    id: 'payment',
    label: 'Payment Settings',
    labelHe: 'הגדרות תשלום',
    icon: CreditCard,
    component: PaymentSettingsForm,
  },
  {
    id: 'invoicing',
    label: 'Invoicing',
    labelHe: 'חשבוניות',
    icon: FileText,
    component: InvoicingSettingsForm,
  },
];

const DEFAULT_TAB = 'branding';

export function TenantSettingsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeSectionId = useMemo(() => {
    const tabParam = searchParams.get('tab');
    const validSection = SECTIONS.find((s) => s.id === tabParam);
    return validSection ? tabParam! : DEFAULT_TAB;
  }, [searchParams]);

  const handleSectionChange = (sectionId: string) => {
    setSearchParams({ tab: sectionId }, { replace: true });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="mb-6 px-6 pt-6">
        <h1 className="text-2xl font-semibold text-[--text-primary]">
          {t('settings.title', 'Settings')}
        </h1>
      </div>

      <SettingsLayout
        sections={SECTIONS}
        activeSectionId={activeSectionId}
        onSectionChange={handleSectionChange}
      />
    </div>
  );
}

export default TenantSettingsPage;
