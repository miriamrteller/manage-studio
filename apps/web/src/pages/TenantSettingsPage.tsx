import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Paintbrush, Building2, Globe, CreditCard, FileText, Scale } from 'lucide-react';

import { SettingsLayout, type SettingsSection } from '@/features/settings/components/SettingsLayout';
import { BrandingSettingsForm } from '@/features/settings/components/BrandingSettingsForm';
import { SchoolProfileForm } from '@/features/settings/components/SchoolProfileForm';
import { LocaleSettingsForm } from '@/features/settings/components/LocaleSettingsForm';
import { PaymentSettingsForm } from '@/features/settings/components/PaymentSettingsForm';
import { InvoicingSettingsForm } from '@/features/settings/components/InvoicingSettingsForm';
import { LegalSettingsForm } from '@/features/settings/components/LegalSettingsForm';

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'branding',
    labelKey: 'settings.tabs.branding',
    label: 'Branding',
    icon: Paintbrush,
    component: BrandingSettingsForm,
  },
  {
    id: 'profile',
    labelKey: 'settings.tabs.profile',
    label: 'Studio profile',
    icon: Building2,
    component: SchoolProfileForm,
  },
  {
    id: 'locale',
    labelKey: 'settings.tabs.locale',
    label: 'Language & Region',
    icon: Globe,
    component: LocaleSettingsForm,
  },
  {
    id: 'payment',
    labelKey: 'settings.tabs.payment',
    label: 'Payment Settings',
    icon: CreditCard,
    component: PaymentSettingsForm,
  },
  {
    id: 'invoicing',
    labelKey: 'settings.tabs.invoicing',
    label: 'Invoicing',
    icon: FileText,
    component: InvoicingSettingsForm,
  },
  {
    id: 'legal',
    labelKey: 'settings.tabs.legal',
    label: 'Legal',
    icon: Scale,
    component: LegalSettingsForm,
  },
];

const DEFAULT_TAB = 'branding';

export function TenantSettingsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeSectionId = useMemo(() => {
    const tabParam = searchParams.get('tab');
    const validSection = SETTINGS_SECTIONS.find((s) => s.id === tabParam);
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
        sections={SETTINGS_SECTIONS}
        activeSectionId={activeSectionId}
        onSectionChange={handleSectionChange}
      />
    </div>
  );
}

export default TenantSettingsPage;
