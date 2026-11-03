import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Paintbrush, Building2, Briefcase, Globe, CreditCard, FileText, Scale, ShieldCheck, Users } from 'lucide-react';

import { SettingsLayout, type SettingsSection } from '@/features/settings/components/SettingsLayout';
import { BrandingSettingsForm } from '@/features/settings/components/BrandingSettingsForm';
import { SchoolProfileForm } from '@/features/settings/components/SchoolProfileForm';
import { BusinessSettings } from '@/features/settings/components/BusinessSettings';
import { LocaleSettingsForm } from '@/features/settings/components/LocaleSettingsForm';
import { PaymentSettingsForm } from '@/features/settings/components/PaymentSettingsForm';
import { InvoicingSettingsForm } from '@/features/settings/components/InvoicingSettingsForm';
import { InvoicingToggleForm } from '@/features/settings/components/InvoicingToggleForm';
import { LeadFormSettings } from '@/features/settings/components/LeadFormSettings';
import { LeadDigestSetting } from '@/features/settings/components/LeadDigestSetting';
import { LegalSettingsForm } from '@/features/settings/components/LegalSettingsForm';
import { SecuritySettingsForm } from '@/features/settings/components/SecuritySettingsForm';

/** Tax documents on/off and the invoicing service first, then that service's credentials. */
function InvoicingSection() {
  return (
    <div className="space-y-10">
      <InvoicingToggleForm />
      <hr className="border-gray-200" />
      <InvoicingSettingsForm />
    </div>
  );
}

/** How enquiries reach the studio: the questions on the enquiry form and the daily follow-up email. */
function LeadsSection() {
  return (
    <div className="space-y-10">
      <LeadFormSettings />
      <hr className="border-gray-200" />
      <LeadDigestSetting />
    </div>
  );
}

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
    id: 'business',
    labelKey: 'settings.tabs.business',
    label: 'Your business',
    icon: Briefcase,
    component: BusinessSettings,
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
    component: InvoicingSection,
  },
  {
    id: 'leads',
    labelKey: 'settings.tabs.leads',
    label: 'Leads',
    icon: Users,
    component: LeadsSection,
  },
  {
    id: 'legal',
    labelKey: 'settings.tabs.legal',
    label: 'Legal',
    icon: Scale,
    component: LegalSettingsForm,
  },
  {
    id: 'security',
    labelKey: 'settings.tabs.security',
    label: 'Security',
    icon: ShieldCheck,
    component: SecuritySettingsForm,
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
