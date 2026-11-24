import type { StudioProfile } from '@shared/index';

/**
 * "How do clients work with you?" (owner, 13 Nov 2026): one question with three ticks instead of
 * a payment question and three switches. Stored in the same studio profile, so every feature gate
 * keeps working:
 * - Classes      → teachesClasses (and "Parents pay for children" → familyAccounts, under it)
 * - Projects     → paymentFlow 'project' (or 'both' with Classes): quotes, deposits, galleries
 * - Appointments → clientBooking: time slots, booked when paid
 */
export interface WorkModes {
  classes: boolean;
  projects: boolean;
  appointments: boolean;
  families: boolean;
}

export function workModesOf(profile: StudioProfile): WorkModes {
  return {
    classes: profile.teachesClasses,
    projects: profile.paymentFlow !== 'recurring',
    appointments: profile.clientBooking,
    families: profile.familyAccounts,
  };
}

export function profileOf(modes: WorkModes): StudioProfile {
  return {
    paymentFlow: modes.projects ? (modes.classes ? 'both' : 'project') : 'recurring',
    teachesClasses: modes.classes,
    // Families only exist with classes (photographer studios have none).
    familyAccounts: modes.classes && modes.families,
    clientBooking: modes.appointments,
  };
}
