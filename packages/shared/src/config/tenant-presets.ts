import { z } from 'zod';

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

export type EntityLabelLocale = 'en' | 'he';

const DEFAULT_LABELS_EN: Record<BusinessPreset, EntityLabels> = {
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

/** Hebrew defaults aligned with apps/web nav copy (programs vertical). */
const DEFAULT_LABELS_HE: Record<BusinessPreset, EntityLabels> = {
  programs: {
    contact: { singular: 'תלמיד', plural: 'תלמידים' },
    account: { singular: 'משפחה', plural: 'משפחות' },
    offering: { singular: 'שיעור', plural: 'שיעורים' },
    season: { singular: 'תקופה', plural: 'תקופות' },
    category: { singular: 'רמה', plural: 'רמות' },
    staff: { singular: 'מורה', plural: 'מורים' },
    engagement: { singular: 'הרשמה', plural: 'הרשמות' },
    session: { singular: 'מפגש', plural: 'מפגשים' },
  },
  services: {
    contact: { singular: 'איש קשר', plural: 'אנשי קשר' },
    account: { singular: 'לקוח', plural: 'לקוחות' },
    offering: { singular: 'שירות', plural: 'שירותים' },
    season: { singular: 'רבעון', plural: 'רבעונים' },
    category: { singular: 'קטגוריה', plural: 'קטגוריות' },
    staff: { singular: 'איש צוות', plural: 'צוות' },
    engagement: { singular: 'התקשרות', plural: 'התקשרויות' },
    session: { singular: 'מפגש', plural: 'מפגשים' },
  },
  catalog: {
    contact: { singular: 'לקוח', plural: 'לקוחות' },
    account: { singular: 'חשבון', plural: 'חשבונות' },
    offering: { singular: 'מוצר', plural: 'מוצרים' },
    season: { singular: 'עונה', plural: 'עונות' },
    category: { singular: 'קטגוריה', plural: 'קטגוריות' },
    staff: { singular: 'צוות', plural: 'צוות' },
    engagement: { singular: 'הזמנה', plural: 'הזמנות' },
    session: { singular: 'מפגש', plural: 'מפגשים' },
  },
};

const DEFAULT_LABELS_BY_LOCALE: Record<EntityLabelLocale, Record<BusinessPreset, EntityLabels>> = {
  en: DEFAULT_LABELS_EN,
  he: DEFAULT_LABELS_HE,
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

const EntityLabelPairSchema = z.object({
  singular: z.string(),
  plural: z.string(),
});

const EntityLabelsOverrideSchema = z
  .object({
    contact: EntityLabelPairSchema.optional(),
    account: EntityLabelPairSchema.optional(),
    offering: EntityLabelPairSchema.optional(),
    season: EntityLabelPairSchema.optional(),
    category: EntityLabelPairSchema.optional(),
    staff: EntityLabelPairSchema.optional(),
    engagement: EntityLabelPairSchema.optional(),
    session: EntityLabelPairSchema.optional(),
  })
  .partial();

export function parseEntityLabelOverrides(raw: unknown): Partial<EntityLabels> {
  try {
    const result = EntityLabelsOverrideSchema.safeParse(
      typeof raw === 'string' ? JSON.parse(raw) : raw
    );
    return result.success ? (result.data as Partial<EntityLabels>) : {};
  } catch {
    return {};
  }
}

export function safePreset(raw: unknown): BusinessPreset {
  if (raw === 'programs' || raw === 'services' || raw === 'catalog') return raw;
  return 'programs';
}

export function resolvePresetModules(preset: BusinessPreset): PresetModules {
  return PRESET_MODULES[preset];
}

export function resolveEntityLabels(
  preset: BusinessPreset,
  overrides: Partial<EntityLabels> = {},
  locale: EntityLabelLocale = 'en',
): EntityLabels {
  const defaults = DEFAULT_LABELS_BY_LOCALE[locale][preset];
  return { ...defaults, ...overrides };
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
