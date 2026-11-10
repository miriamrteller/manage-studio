/**
 * Settings → Discounts: the studio's automatic class discounts (class_discount_settings,
 * migration 20261110111500_class_discounts.sql). The database applies them when a child
 * is enrolled; this file only maps the row to the form and back.
 */
export type DiscountUnit = 'percent' | 'amount';
export type CombineMode = 'add_up' | 'biggest';

export interface ClassDiscountRow {
  combine_mode: CombineMode;
  max_total_percent: number;
  sibling_enabled: boolean;
  sibling_unit: DiscountUnit;
  sibling_value: number;
  sibling_more_value: number;
  extra_class_enabled: boolean;
  extra_class_unit: DiscountUnit;
  extra_class_value: number;
  early_bird_enabled: boolean;
  early_bird_unit: DiscountUnit;
  early_bird_value: number;
  early_bird_days_before: number;
}

/** Suggested starting values (all switched off), the same as the database defaults. */
export const DEFAULT_CLASS_DISCOUNTS: ClassDiscountRow = {
  combine_mode: 'add_up',
  max_total_percent: 30,
  sibling_enabled: false,
  sibling_unit: 'percent',
  sibling_value: 10,
  sibling_more_value: 15,
  extra_class_enabled: false,
  extra_class_unit: 'percent',
  extra_class_value: 10,
  early_bird_enabled: false,
  early_bird_unit: 'percent',
  early_bird_value: 5,
  early_bird_days_before: 30,
};

/** What the form edits: amounts as typed (shekels for 'amount', whole percent for 'percent'). */
export interface ClassDiscountForm {
  combine_mode: CombineMode;
  max_total_percent: string;
  sibling_enabled: boolean;
  sibling_unit: DiscountUnit;
  sibling_value: string;
  sibling_more_value: string;
  extra_class_enabled: boolean;
  extra_class_unit: DiscountUnit;
  extra_class_value: string;
  early_bird_enabled: boolean;
  early_bird_unit: DiscountUnit;
  early_bird_value: string;
  early_bird_days_before: string;
}

function valueToText(unit: DiscountUnit, value: number): string {
  if (unit === 'percent') return String(value);
  const major = value / 100;
  return Number.isInteger(major) ? String(major) : major.toFixed(2);
}

function textToValue(unit: DiscountUnit, text: string): number | null {
  const n = Number(text.trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (unit === 'percent') {
    return Number.isInteger(n) && n <= 90 ? n : null;
  }
  return Math.round(n * 100);
}

export function rowToForm(row: ClassDiscountRow | null | undefined): ClassDiscountForm {
  const r = row ?? DEFAULT_CLASS_DISCOUNTS;
  return {
    combine_mode: r.combine_mode,
    max_total_percent: String(r.max_total_percent),
    sibling_enabled: r.sibling_enabled,
    sibling_unit: r.sibling_unit,
    sibling_value: valueToText(r.sibling_unit, r.sibling_value),
    sibling_more_value: valueToText(r.sibling_unit, r.sibling_more_value),
    extra_class_enabled: r.extra_class_enabled,
    extra_class_unit: r.extra_class_unit,
    extra_class_value: valueToText(r.extra_class_unit, r.extra_class_value),
    early_bird_enabled: r.early_bird_enabled,
    early_bird_unit: r.early_bird_unit,
    early_bird_value: valueToText(r.early_bird_unit, r.early_bird_value),
    early_bird_days_before: String(r.early_bird_days_before),
  };
}

export type ClassDiscountField =
  | 'max_total_percent'
  | 'sibling_value'
  | 'sibling_more_value'
  | 'extra_class_value'
  | 'early_bird_value'
  | 'early_bird_days_before';

/** Pure: the row to save, or the fields that need fixing. */
export function formToRow(
  form: ClassDiscountForm,
): { ok: true; row: ClassDiscountRow } | { ok: false; invalid: ClassDiscountField[] } {
  const invalid: ClassDiscountField[] = [];
  const pick = (field: ClassDiscountField, value: number | null): number => {
    if (value === null) invalid.push(field);
    return value ?? 0;
  };
  const max = Number(form.max_total_percent);
  const days = Number(form.early_bird_days_before);
  const row: ClassDiscountRow = {
    combine_mode: form.combine_mode,
    max_total_percent: pick('max_total_percent', Number.isInteger(max) && max >= 1 && max <= 90 ? max : null),
    sibling_enabled: form.sibling_enabled,
    sibling_unit: form.sibling_unit,
    sibling_value: pick('sibling_value', textToValue(form.sibling_unit, form.sibling_value)),
    sibling_more_value: pick('sibling_more_value', textToValue(form.sibling_unit, form.sibling_more_value)),
    extra_class_enabled: form.extra_class_enabled,
    extra_class_unit: form.extra_class_unit,
    extra_class_value: pick('extra_class_value', textToValue(form.extra_class_unit, form.extra_class_value)),
    early_bird_enabled: form.early_bird_enabled,
    early_bird_unit: form.early_bird_unit,
    early_bird_value: pick('early_bird_value', textToValue(form.early_bird_unit, form.early_bird_value)),
    early_bird_days_before: pick(
      'early_bird_days_before',
      Number.isInteger(days) && days >= 0 && days <= 365 ? days : null,
    ),
  };
  return invalid.length > 0 ? { ok: false, invalid } : { ok: true, row };
}
