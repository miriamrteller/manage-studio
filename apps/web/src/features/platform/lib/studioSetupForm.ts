import { OPALSWIFT_BRAND } from '@/lib/theme/opalswiftBrand';
import type { PaymentFlow, StudioProfile } from '@shared/index';
import type { StudioInvoicingProvider, StudioPaymentProvider } from '../services/studioSetupService';

export type StudioVertical = 'dance-studio' | 'photographer' | 'beautician' | 'generic';
export const VERTICALS: StudioVertical[] = ['dance-studio', 'photographer', 'beautician', 'generic'];

export interface StudioSetupForm {
  name: string;
  subdomain: string;
  languageDefault: 'he' | 'en';
  country: 'IL' | 'US';
  vertical: StudioVertical;
  paymentProvider: StudioPaymentProvider;
  invoicingProvider: StudioInvoicingProvider;
  primaryColor: string;
  accentColor: string;
  ownerEmail: string;
  /** How clients pay and which areas the studio uses; pre-filled from the studio type, always editable. */
  paymentFlow: PaymentFlow;
  teachesClasses: boolean;
  familyAccounts: boolean;
  clientBooking: boolean;
  /**
   * Answer to "Will you charge monthly fees?" (null = not answered). Pre-filled from the studio
   * type; decides which payment providers are offered. Not sent: it only guides the choice.
   */
  monthlyFees: boolean | null;
}

/**
 * Defaults: English, OpalSwift colours, online card payment through Grow with Grow's tax
 * documents. Nothing needs to be connected to finish setup: keys are entered later in Settings,
 * and the studio can change its payment provider until its first payment.
 */
export const INITIAL_FORM: StudioSetupForm = {
  name: '',
  subdomain: '',
  languageDefault: 'en',
  country: 'IL',
  vertical: 'generic',
  paymentProvider: 'grow',
  invoicingProvider: 'grow',
  primaryColor: OPALSWIFT_BRAND.primary,
  accentColor: OPALSWIFT_BRAND.accent,
  ownerEmail: '',
  paymentFlow: 'both',
  teachesClasses: false,
  familyAccounts: false,
  clientBooking: false,
  monthlyFees: null,
};

/**
 * What the studio type pre-fills for the business profile. Only a starting point: the wizard shows
 * every answer and the owner changes any of it (and again later in Settings, "Your business").
 */
export function profileDefaultsFor(vertical: StudioVertical): StudioProfile {
  switch (vertical) {
    case 'dance-studio':
      return { paymentFlow: 'recurring', teachesClasses: true, familyAccounts: true, clientBooking: false };
    case 'photographer':
      return { paymentFlow: 'project', teachesClasses: false, familyAccounts: false, clientBooking: true };
    case 'beautician':
      // Paid per visit, so "per project" matches the old "no monthly fees" answer; the owner can change it.
      return { paymentFlow: 'project', teachesClasses: false, familyAccounts: false, clientBooking: true };
    default:
      return { paymentFlow: 'both', teachesClasses: false, familyAccounts: false, clientBooking: false };
  }
}

/** "Will you charge monthly fees?" follows the payment flow unless the owner answers otherwise. */
export function monthlyFeesForFlow(flow: PaymentFlow): boolean {
  return flow !== 'project';
}

/** Class-based studios (terms, family billing) use the Professional layout. */
export function planForVertical(vertical: StudioVertical): 'essential' | 'professional' {
  return vertical === 'dance-studio' ? 'professional' : 'essential';
}

function localeForCountry(country: 'IL' | 'US') {
  return country === 'US' ? { currency: 'USD', phoneRegion: 'US' } : { currency: 'ILS', phoneRegion: 'IL' };
}

/** The request the wizard sends for a filled-in form. */
export function toSetupRequest(form: StudioSetupForm) {
  return {
    name: form.name.trim(),
    subdomain: form.subdomain.trim().toLowerCase(),
    plan: planForVertical(form.vertical),
    vertical: form.vertical,
    ownerEmail: form.ownerEmail.trim().toLowerCase(),
    languageDefault: form.languageDefault,
    country: form.country,
    ...localeForCountry(form.country),
    paymentProvider: form.paymentProvider,
    invoicingProvider: form.invoicingProvider,
    primaryColor: form.primaryColor,
    accentColor: form.accentColor,
    profile: {
      paymentFlow: form.paymentFlow,
      teachesClasses: form.teachesClasses,
      familyAccounts: form.familyAccounts,
      clientBooking: form.clientBooking,
    },
  };
}

/**
 * A web-address suggestion from the studio's name: lower-case Latin letters and
 * digits joined by hyphens. Empty when the name has no Latin letters (e.g. a
 * Hebrew name), so the admin types one.
 */
export function suggestSubdomain(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

/** The studio's main language: the language the person is using now. */
export function defaultStudioLanguage(uiLanguage: string | null | undefined): StudioSetupForm['languageDefault'] {
  return (uiLanguage ?? '').toLowerCase().startsWith('he') ? 'he' : 'en';
}
