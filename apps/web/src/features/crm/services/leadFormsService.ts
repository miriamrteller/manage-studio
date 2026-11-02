import { supabase } from '@/lib/supabase';

/** A named enquiry form (lead_forms), as admins see it. */
export interface NamedLeadForm {
  id: string;
  slug: string;
  name: string;
  title_en: string | null;
  title_he: string | null;
  intro_en: string | null;
  intro_he: string | null;
  image_url: string | null;
  question_keys: string[] | null;
  offering_id: string | null;
  active: boolean;
  ends_on: string | null;
  created_at: string;
}

export type NamedLeadFormInput = Omit<NamedLeadForm, 'id' | 'created_at'>;

const COLUMNS =
  'id, slug, name, title_en, title_he, intro_en, intro_he, image_url, question_keys, offering_id, active, ends_on, created_at';

export async function listNamedForms(tenantId: string): Promise<NamedLeadForm[]> {
  const { data, error } = await supabase
    .from('lead_forms')
    .select(COLUMNS)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as NamedLeadForm[];
}

/** True when no other form of this studio uses the slug. */
export async function isFormSlugFree(tenantId: string, slug: string, exceptId?: string | null): Promise<boolean> {
  let query = supabase.from('lead_forms').select('id').eq('tenant_id', tenantId).eq('slug', slug);
  if (exceptId) query = query.neq('id', exceptId);
  const { data, error } = await query.limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length === 0;
}

export async function saveNamedForm(tenantId: string, input: NamedLeadFormInput, id?: string | null): Promise<string> {
  const row = { ...input, tenant_id: tenantId };
  const { data, error } = id
    ? await supabase.from('lead_forms').update(row).eq('id', id).eq('tenant_id', tenantId).select('id').single()
    : await supabase.from('lead_forms').insert(row).select('id').single();
  if (error) {
    // 23505 = the (tenant, slug) unique constraint: someone took the slug meanwhile.
    if ((error as { code?: string }).code === '23505') throw new Error('slug_taken');
    throw new Error(error.message);
  }
  return (data as { id: string }).id;
}

export async function deleteNamedForm(tenantId: string, id: string): Promise<void> {
  const { error } = await supabase.from('lead_forms').delete().eq('id', id).eq('tenant_id', tenantId);
  if (error) throw new Error(error.message);
}

/** Leads and won leads per form (won = converted to a client). */
export async function namedFormCounts(tenantId: string): Promise<Record<string, { leads: number; won: number }>> {
  const { data, error } = await supabase
    .from('leads')
    .select('form_id, converted_account_id')
    .eq('tenant_id', tenantId)
    .not('form_id', 'is', null)
    .limit(5000);
  if (error) throw new Error(error.message);
  const counts: Record<string, { leads: number; won: number }> = {};
  for (const row of (data ?? []) as Array<{ form_id: string; converted_account_id: string | null }>) {
    const c = (counts[row.form_id] ??= { leads: 0, won: 0 });
    c.leads += 1;
    if (row.converted_account_id) c.won += 1;
  }
  return counts;
}

/** The studio's active classes and packages, for a form's pre-selected offering. */
export async function listFormOfferings(tenantId: string): Promise<Array<{ id: string; name: string; offering_type: string }>> {
  const { data, error } = await supabase
    .from('offerings')
    .select('id, name, offering_type')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ id: string; name: string; offering_type: string }>;
}

/** Upload a form image to the studio's public assets folder; returns its URL. */
export async function uploadFormImage(tenantId: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() ?? 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const path = `${tenantId}/lead-forms/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('tenant-assets').upload(path, file, { upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from('tenant-assets').getPublicUrl(path).data.publicUrl;
}
