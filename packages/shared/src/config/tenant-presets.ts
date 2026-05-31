export type BusinessPreset = 'programs' | 'services' | 'catalog';

export type EntityKey =
  | 'contact'
  | 'account'
  | 'offering'
  | 'season'
  | 'category'
  | 'staff'
  | 'engagement'
  | 'session';

export type EntityLabels = Record<EntityKey, { singular: string; plural: string }>;

export type PresetModules = {
  accounts: boolean;
  scheduling: boolean;
  attendance: boolean;
  waitlist: boolean;
  consent: boolean;
  eligibility: boolean;
  categories: boolean;
  staff: boolean;
};

const DEFAULT_LABELS: Record<BusinessPreset, EntityLabels> = {
  programs: {
    contact: { singular: 'Student', plural: 'Students' },
    account: { singular: 'Family', plural: 'Families' },
    offering: { singular: 'Class', plural: 'Classes' },
    season: { singular: 'Term', plural: 'Terms' },
    category: { singular: 'Level', plural: 'Levels' },
    staff: { singular: 'Teacher', plural: 'Teachers' },
    engagement: { singular: 'Enrolment', plural: 'Enrolments' },
    session: { singular: 'Session', plural: 'Sessions' },
  },
  services: {
    contact: { singular: 'Contact', plural: 'Contacts' },
    account: { singular: 'Client', plural: 'Clients' },
    offering: { singular: 'Service', plural: 'Services' },
    season: { singular: 'Quarter', plural: 'Quarters' },
    category: { singular: 'Category', plural: 'Categories' },
    staff: { singular: 'Team member', plural: 'Team' },
    engagement: { singular: 'Engagement', plural: 'Engagements' },
    session: { singular: 'Session', plural: 'Sessions' },
  },
  catalog: {
    contact: { singular: 'Customer', plural: 'Customers' },
    account: { singular: 'Account', plural: 'Accounts' },
    offering: { singular: 'Product', plural: 'Products' },
    season: { singular: 'Season', plural: 'Seasons' },
    category: { singular: 'Category', plural: 'Categories' },
    staff: { singular: 'Staff', plural: 'Staff' },
    engagement: { singular: 'Order', plural: 'Orders' },
    session: { singular: 'Session', plural: 'Sessions' },
  },
};

const PRESET_MODULES: Record<BusinessPreset, PresetModules> = {
  programs: {
    accounts: true,
    scheduling: true,
    attendance: true,
    waitlist: true,
    consent: true,
    eligibility: true,
    categories: true,
    staff: true,
  },
  services: {
    accounts: true,
    scheduling: false,
    attendance: false,
    waitlist: false,
    consent: false,
    eligibility: false,
    categories: false,
    staff: false,
  },
  catalog: {
    accounts: false,
    scheduling: false,
    attendance: false,
    waitlist: false,
    consent: false,
    eligibility: false,
    categories: true,
    staff: false,
  },
};

export function resolvePresetModules(preset: BusinessPreset): PresetModules {
  return PRESET_MODULES[preset];
}

export function resolveEntityLabels(
  preset: BusinessPreset,
  overrides: Partial<EntityLabels> = {},
): EntityLabels {
  return { ...DEFAULT_LABELS[preset], ...overrides };
}

export function getDefaultRoleForPreset(preset: BusinessPreset): string {
  switch (preset) {
    case 'catalog':
      return 'customer';
    case 'services':
      return 'client';
    default:
      return 'account_holder';
  }
}
