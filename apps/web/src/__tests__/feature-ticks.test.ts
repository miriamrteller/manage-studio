import { describe, expect, it } from 'vitest';
import { FEATURES, type FeatureKey, type StudioProfile } from '@shared/index';
import { navigationConfig } from '@/components/Navigation/navigationConfig';
import { isPageSwitchedOff } from '@/layouts/HiddenPageGuard';
import { rowsForModes } from '@/features/setup-guide/lib/setupChecklist';

const item = (path: string) => {
  const found = navigationConfig.find((entry) => entry.path === path);
  if (!found) throw new Error(`no menu item ${path}`);
  return found;
};

const noClasses: StudioProfile = { paymentFlow: 'project', teachesClasses: false, familyAccounts: false, clientBooking: true };
const classes: StudioProfile = { paymentFlow: 'recurring', teachesClasses: true, familyAccounts: true, clientBooking: false };
const has = (keys: FeatureKey[]) => (key: FeatureKey) => keys.includes(key);

describe('pages hidden by the ticks cannot be opened by address', () => {
  it('Seasons and Levels are off without Classes', () => {
    expect(isPageSwitchedOff(item('/admin/classes/seasons'), noClasses, has([]))).toBe(true);
    expect(isPageSwitchedOff(item('/admin/classes/levels'), noClasses, has([]))).toBe(true);
  });

  it('Seasons is on with Classes and its feature', () => {
    expect(isPageSwitchedOff(item('/admin/classes/seasons'), classes, has([FEATURES.offerings.structure]))).toBe(false);
  });

  it('Projects is off for a classes-only studio, on with Projects', () => {
    expect(isPageSwitchedOff(item('/admin/projects'), classes, has([]))).toBe(true);
    expect(isPageSwitchedOff(item('/admin/projects'), noClasses, has([FEATURES.billing.quotes]))).toBe(false);
  });

  it('Families follow "Parents pay for children"', () => {
    expect(isPageSwitchedOff(item('/admin/people/families'), noClasses, has([]))).toBe(true);
    expect(isPageSwitchedOff(item('/admin/people/families'), classes, has([FEATURES.people.families]))).toBe(false);
  });

  it('pages not tied to a tick stay open (dormant Stripe settings keep their own handling)', () => {
    expect(isPageSwitchedOff(item('/admin/people'), noClasses, has([]))).toBe(false);
    expect(isPageSwitchedOff(item('/admin/settings/payments'), noClasses, has([]))).toBe(false);
  });
});

describe('setup checklist rows follow the ticks', () => {
  it('no class steps without Classes', () => {
    const rows = rowsForModes({ classes: false, projects: true, appointments: false });
    expect(rows).not.toContain('season');
    expect(rows).not.toContain('levels');
    expect(rows).not.toContain('test_enrolment');
    expect(rows).toEqual(['branding', 'packages', 'payments', 'legal', 'leads', 'first_quote']);
  });

  it('classes-only keeps the class order', () => {
    expect(rowsForModes({ classes: true, projects: false, appointments: false })).toEqual([
      'branding', 'levels', 'season', 'classes', 'payments', 'legal', 'test_enrolment',
    ]);
  });

  it('appointments-only: services and leads', () => {
    expect(rowsForModes({ classes: false, projects: false, appointments: true })).toEqual([
      'branding', 'offerings', 'payments', 'legal', 'leads',
    ]);
  });
});
