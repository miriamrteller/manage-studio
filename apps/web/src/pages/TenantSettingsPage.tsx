import { useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Paintbrush, Building2, Briefcase, Globe, ToggleRight, CreditCard, FileText, Scale, ShieldCheck } from 'lucide-react';

import type { SettingsSection } from '@/features/settings/components/SettingsLayout';
import { BrandingSettingsForm } from '@/features/settings/components/BrandingSettingsForm';
import { SchoolProfileForm } from '@/features/settings/components/SchoolProfileForm';
import { BusinessSettings } from '@/features/settings/components/BusinessSettings';
import { StudioFeatureSettings } from '@/features/settings/components/StudioFeatureSettings';
import { LocaleSettingsForm } from '@/features/settings/components/LocaleSettingsForm';
import { PaymentSettingsForm } from '@/features/settings/components/PaymentSettingsForm';
import { InvoicingSettingsForm } from '@/features/settings/components/InvoicingSettingsForm';
import { InvoicingToggleForm } from '@/features/settings/components/InvoicingToggleForm';
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
    id: 'features',
    labelKey: 'settings.tabs.features',
    label: 'Features',
    icon: ToggleRight,
    component: StudioFeatureSettings,
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

/** Sections that moved to their own area's tabs: old links (?tab=…) still land there. */
const MOVED_TABS: Record<string, string> = {
  class_cards: '/admin/classes/cards',
  leads: '/admin/leads/settings',
};

/**
 * Settings: each section is a tab along the top of the page (AreaTabs, from the menu config),
 * so this page shows only the section the address names.
 */
export function TenantSettingsPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');

  const active = useMemo(
    () =>
      SETTINGS_SECTIONS.find((s) => s.id === tabParam) ??
      SETTINGS_SECTIONS.find((s) => s.id === DEFAULT_TAB)!,
    [tabParam],
  );

  if (tabParam && MOVED_TABS[tabParam]) {
    return <Navigate to={MOVED_TABS[tabParam]} replace />;
  }

  const ActiveComponent = active.component;
  return (
    <div className="flex flex-col h-full">
      <h1 className="mb-6 text-2xl font-semibold text-[--text-primary]">
        {t('settings.title', 'Settings')}
      </h1>
      <div id={`tabpanel-${active.id}`}>
        <ActiveComponent />
      </div>
    </div>
  );
}

export default TenantSettingsPage;
