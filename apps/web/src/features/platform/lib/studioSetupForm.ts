import { OPALSWIFT_BRAND } from '@/lib/theme/opalswiftBrand';
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
}

/**
 * Defaults: English, OpalSwift colours, and the default studio: a registered business
 * taking card payments through a provider, with tax documents on.
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
};

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
  };
}
