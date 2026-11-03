import { EXISTING_STUDIO_PROFILE, FEATURES, safeVertical, type StudioProfile, type VerticalId } from '@shared/index';

/**
 * What a studio's public homepage (and menu) may show. ONE place answers "does this studio have X",
 * so the per-studio feature switches can plug in later by changing these checks only.
 */
export interface StudioSectionInput {
  /** Skin (tenants.skin): wording only, never decides what the studio has. */
  vertical?: string | null;
  enabledFeatures?: readonly string[] | null;
  /** Payment flow and switches; missing reads as an existing studio (everything on). */
  profile?: StudioProfile | null;
}

export function studioVertical(input: StudioSectionInput): VerticalId {
  return safeVertical(input.vertical);
}

/** The studio switched classes on. */
export function studioHasClasses(input: StudioSectionInput): boolean {
  return (input.profile ?? EXISTING_STUDIO_PROFILE).teachesClasses;
}

/** Online booking of services/packages is switched on for the studio. */
export function studioHasBooking(input: StudioSectionInput): boolean {
  return input.enabledFeatures?.includes(FEATURES.scheduling.clientBooking) ?? false;
}

/** The public enquiry form (/inquire) exists for every studio. */
export function studioHasEnquiry(input: StudioSectionInput): boolean {
  return input !== null;
}

export type HomeCta = { kind: 'classes' | 'book' | 'enquiry'; path: '/classes' | '/book' | '/inquire' };

/**
 * The hero's main button and, when there is a second sensible one, the secondary button.
 * Classes first for a studio that teaches them. Otherwise a studio that sells projects leads
 * with the enquiry form (booking second), and a monthly-only studio with booking leads with booking.
 */
export function homeButtons(input: StudioSectionInput): { primary: HomeCta; secondary: HomeCta | null } {
  const classes: HomeCta = { kind: 'classes', path: '/classes' };
  const book: HomeCta = { kind: 'book', path: '/book' };
  const enquiry: HomeCta = { kind: 'enquiry', path: '/inquire' };
  if (studioHasClasses(input)) return { primary: classes, secondary: enquiry };
  const booking = studioHasBooking(input);
  const sellsProjects = (input.profile ?? EXISTING_STUDIO_PROFILE).paymentFlow !== 'recurring';
  if (sellsProjects) return { primary: enquiry, secondary: booking ? book : null };
  return booking ? { primary: book, secondary: enquiry } : { primary: enquiry, secondary: null };
}

/** Key of the one-line intro under the studio name (pages.home.intro_<key>). */
export function homeIntroKey(input: StudioSectionInput): 'dance' | 'generic' | 'photographer' | 'beautician' {
  const vertical = studioVertical(input);
  return vertical === 'dance-studio' ? 'dance' : vertical;
}
