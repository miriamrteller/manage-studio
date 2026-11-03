import { APPOINTMENT_VERTICALS, FEATURES, safeVertical, type VerticalId } from '@shared/index';

/**
 * What a studio's public homepage (and menu) may show. ONE place answers "does this studio have X",
 * so the per-studio feature switches can plug in later by changing these checks only.
 */
export interface StudioSectionInput {
  vertical?: string | null;
  enabledFeatures?: readonly string[] | null;
}

export function studioVertical(input: StudioSectionInput): VerticalId {
  return safeVertical(input.vertical);
}

/** Class businesses (dance, generic) run classes; appointment businesses (photographer, beautician) do not. */
export function studioHasClasses(input: StudioSectionInput): boolean {
  return !APPOINTMENT_VERTICALS.includes(studioVertical(input));
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

/** The hero's main button and, when there is a second sensible one, the secondary button. */
export function homeButtons(input: StudioSectionInput): { primary: HomeCta; secondary: HomeCta | null } {
  const vertical = studioVertical(input);
  const classes: HomeCta = { kind: 'classes', path: '/classes' };
  const book: HomeCta = { kind: 'book', path: '/book' };
  const enquiry: HomeCta = { kind: 'enquiry', path: '/inquire' };
  const booking = studioHasBooking(input);
  switch (vertical) {
    case 'photographer':
      return { primary: enquiry, secondary: booking ? book : null };
    case 'beautician':
      return booking ? { primary: book, secondary: enquiry } : { primary: enquiry, secondary: null };
    default:
      return { primary: classes, secondary: enquiry };
  }
}

/** Key of the one-line intro under the studio name (pages.home.intro_<key>). */
export function homeIntroKey(input: StudioSectionInput): 'dance' | 'generic' | 'photographer' | 'beautician' {
  const vertical = studioVertical(input);
  return vertical === 'dance-studio' ? 'dance' : vertical;
}
