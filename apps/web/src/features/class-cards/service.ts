import { supabase } from '@/lib/supabase';
import type { Database } from '@shared/database.types';

export type ClassCardSettingsRow = Database['public']['Tables']['tenant_class_card_settings']['Row'];
export type ClassCardTypeRow = Database['public']['Tables']['class_card_types']['Row'];

export interface ClassCardType extends ClassCardTypeRow {
  offering_ids: string[];
}

export interface StudioClass {
  id: string;
  name: string;
  min_age: number | null;
}

/** What a studio gets before it saves anything: switched off, 12 hours, 3 months. */
export const DEFAULT_CLASS_CARD_SETTINGS = {
  enabled: false,
  cancel_cutoff_hours: 12,
  extension_months: 3,
} as const;

/** Classes ticked on a new card: the adult classes (18+). If the studio has none marked 18+, all of them. */
export function defaultCoveredClasses(classes: StudioClass[]): string[] {
  const adult = classes.filter((c) => c.min_age != null && c.min_age >= 18);
  return (adult.length > 0 ? adult : classes).map((c) => c.id);
}

export async function fetchClassCardSettings(tenantId: string) {
  const { data, error } = await supabase
    .from('tenant_class_card_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;
  return { ...DEFAULT_CLASS_CARD_SETTINGS, ...(data ?? {}) };
}

export async function saveClassCardSettings(
  tenantId: string,
  values: { enabled: boolean; cancel_cutoff_hours: number; extension_months: number },
) {
  const { error } = await supabase
    .from('tenant_class_card_settings')
    .upsert({ tenant_id: tenantId, ...values }, { onConflict: 'tenant_id' });
  if (error) throw error;
}

export async function fetchStudioClasses(tenantId: string): Promise<StudioClass[]> {
  const { data, error } = await supabase
    .from('offerings')
    .select('id, name, min_age')
    .eq('tenant_id', tenantId)
    .eq('offering_type', 'class')
    .neq('status', 'cancelled')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function fetchClassCardTypes(tenantId: string): Promise<ClassCardType[]> {
  const { data, error } = await supabase
    .from('class_card_types')
    .select('*, class_card_type_offerings(offering_id)')
    .eq('tenant_id', tenantId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map(({ class_card_type_offerings, ...row }) => ({
    ...row,
    offering_ids: ((class_card_type_offerings ?? []) as { offering_id: string }[]).map((o) => o.offering_id),
  }));
}

export interface ClassCardTypeInput {
  name: string;
  class_count: number;
  price_minor: number;
  valid_months: number | null;
  shareable: boolean;
  is_active: boolean;
  offering_ids: string[];
}

/** Creates or updates a card and sets the classes it covers. */
export async function saveClassCardType(tenantId: string, currency: string, input: ClassCardTypeInput, id?: string) {
  const { offering_ids, ...fields } = input;
  let typeId = id;
  if (typeId) {
    const { error } = await supabase.from('class_card_types').update(fields).eq('id', typeId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from('class_card_types')
      .insert({ ...fields, tenant_id: tenantId, currency })
      .select('id')
      .single();
    if (error) throw error;
    typeId = data.id;
  }

  const { data: current, error: readError } = await supabase
    .from('class_card_type_offerings')
    .select('offering_id')
    .eq('card_type_id', typeId);
  if (readError) throw readError;
  const have = new Set((current ?? []).map((r) => r.offering_id));
  const want = new Set(offering_ids);
  const remove = [...have].filter((o) => !want.has(o));
  const add = [...want].filter((o) => !have.has(o));
  if (remove.length > 0) {
    const { error } = await supabase
      .from('class_card_type_offerings')
      .delete()
      .eq('card_type_id', typeId)
      .in('offering_id', remove);
    if (error) throw error;
  }
  if (add.length > 0) {
    const { error } = await supabase
      .from('class_card_type_offerings')
      .insert(add.map((offering_id) => ({ card_type_id: typeId!, tenant_id: tenantId, offering_id })));
    if (error) throw error;
  }
  return typeId;
}
