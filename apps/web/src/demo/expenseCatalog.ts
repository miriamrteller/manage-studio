/**
 * The common expense categories and each skin's starting set, copied from
 * supabase/migrations/20261104215025_expense_category_catalog.sql. A new studio
 * starts with its skin's set switched on (the tenants_seed_expense_categories
 * trigger); the demo studios are seeded the same way.
 */
import type { Row } from './fakeSupabase';

export const EXPENSE_CATALOG: Row[] = [
  { key: 'rent', name_en: 'Rent', name_he: 'שכירות', is_vat_eligible: true, sort_order: 10 },
  { key: 'municipal_tax', name_en: 'Municipal tax (arnona)', name_he: 'ארנונה', is_vat_eligible: false, sort_order: 20 },
  { key: 'utilities', name_en: 'Electricity and water', name_he: 'חשמל ומים', is_vat_eligible: true, sort_order: 30 },
  { key: 'phone_internet', name_en: 'Phone and internet', name_he: 'טלפון ואינטרנט', is_vat_eligible: true, sort_order: 40 },
  { key: 'staff_wages', name_en: 'Staff wages', name_he: 'שכר עובדים', is_vat_eligible: false, sort_order: 50 },
  { key: 'freelancers', name_en: 'Freelancers and subcontractors', name_he: 'פרילנסרים וקבלני משנה', is_vat_eligible: true, sort_order: 60 },
  { key: 'equipment', name_en: 'Equipment', name_he: 'ציוד', is_vat_eligible: true, sort_order: 70 },
  { key: 'supplies', name_en: 'Materials and supplies', name_he: 'חומרים ומתכלים', is_vat_eligible: true, sort_order: 80 },
  { key: 'products_resale', name_en: 'Products for resale', name_he: 'מוצרים למכירה', is_vat_eligible: true, sort_order: 90 },
  { key: 'office', name_en: 'Office supplies', name_he: 'ציוד משרדי', is_vat_eligible: true, sort_order: 100 },
  { key: 'software', name_en: 'Software and subscriptions', name_he: 'תוכנה ומנויים', is_vat_eligible: true, sort_order: 110 },
  { key: 'marketing', name_en: 'Marketing and advertising', name_he: 'שיווק ופרסום', is_vat_eligible: true, sort_order: 120 },
  { key: 'professional_services', name_en: 'Professional services (accountant, lawyer, consultant)', name_he: 'שירותים מקצועיים', is_vat_eligible: true, sort_order: 130 },
  { key: 'bank_fees', name_en: 'Bank and card fees', name_he: 'עמלות בנק וסליקה', is_vat_eligible: false, sort_order: 140 },
  { key: 'insurance', name_en: 'Insurance', name_he: 'ביטוח', is_vat_eligible: true, sort_order: 150 },
  { key: 'travel', name_en: 'Travel and fuel', name_he: 'נסיעות ודלק', is_vat_eligible: true, sort_order: 160 },
  { key: 'vehicle', name_en: 'Vehicle costs', name_he: 'הוצאות רכב', is_vat_eligible: true, sort_order: 170 },
  { key: 'training', name_en: 'Training and courses', name_he: 'השתלמויות וקורסים', is_vat_eligible: true, sort_order: 180 },
  { key: 'maintenance', name_en: 'Repairs and maintenance', name_he: 'תיקונים ותחזוקה', is_vat_eligible: true, sort_order: 190 },
  { key: 'cleaning', name_en: 'Cleaning', name_he: 'ניקיון', is_vat_eligible: true, sort_order: 200 },
  { key: 'refreshments', name_en: 'Refreshments and hosting', name_he: 'כיבוד ואירוח', is_vat_eligible: true, sort_order: 210 },
  { key: 'costumes', name_en: 'Costumes and performances', name_he: 'תלבושות והופעות', is_vat_eligible: true, sort_order: 220 },
  { key: 'music_licences', name_en: 'Music licences', name_he: 'רישיונות למוזיקה', is_vat_eligible: true, sort_order: 230 },
  { key: 'venue_hire', name_en: 'Hall and venue hire', name_he: 'השכרת אולמות', is_vat_eligible: true, sort_order: 240 },
  { key: 'props_backdrops', name_en: 'Props and backdrops', name_he: 'אביזרים ורקעים', is_vat_eligible: true, sort_order: 250 },
  { key: 'printing', name_en: 'Printing and albums', name_he: 'הדפסות ואלבומים', is_vat_eligible: true, sort_order: 260 },
  { key: 'other', name_en: 'Other', name_he: 'אחר', is_vat_eligible: true, sort_order: 1000 },
];

export const SKIN_EXPENSE_SETS: Record<string, string[]> = {
  'generic': ['rent','utilities','phone_internet','staff_wages','freelancers','equipment','supplies','software','marketing','professional_services','bank_fees','insurance','travel','other'],
  'dance-studio': ['rent','municipal_tax','utilities','staff_wages','equipment','software','marketing','professional_services','bank_fees','insurance','maintenance','cleaning','costumes','music_licences','venue_hire','other'],
  'photographer': ['phone_internet','freelancers','equipment','software','marketing','professional_services','bank_fees','insurance','travel','vehicle','training','props_backdrops','printing','other'],
  'beautician': ['rent','utilities','equipment','supplies','products_resale','software','marketing','professional_services','bank_fees','insurance','training','maintenance','cleaning','other'],
};

/** The verticals rows the app reads (only the expense_categories column). */
export function expenseVerticals(): Row[] {
  return Object.entries(SKIN_EXPENSE_SETS).map(([id, keys]) => ({ id, expense_categories: keys }));
}

/** A new studio's categories: its skin's set (or the generic one), Hebrew name stored. */
export function seedExpenseCategories(tenantId: string, skin: string, at: string, idOf: (n: number) => string): Row[] {
  const keys = SKIN_EXPENSE_SETS[skin] ?? SKIN_EXPENSE_SETS.generic;
  return EXPENSE_CATALOG.filter((c) => keys.includes(c.key as string)).map((c, i) => ({
    id: idOf(i + 1),
    tenant_id: tenantId,
    name: c.name_he,
    is_vat_eligible: c.is_vat_eligible,
    is_active: true,
    sort_order: c.sort_order,
    catalog_key: c.key,
    created_at: at,
    updated_at: at,
  }));
}
