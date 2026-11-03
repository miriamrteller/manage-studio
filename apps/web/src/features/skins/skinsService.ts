import { supabase } from '@/lib/supabase';
import { parseSkinRow, SKIN_COLUMNS, toSkinRow, type Skin } from '@shared/index';

/** Every skin, drafts included (the platform owner's Skins page). */
export async function fetchAllSkins(): Promise<Skin[]> {
  const { data, error } = await supabase
    .from('verticals')
    .select(SKIN_COLUMNS)
    .order('sort_order')
    .order('id');
  if (error) throw new Error(`Failed to fetch skins: ${error.message}`);
  return (data ?? []).map((row) => parseSkinRow(row as Record<string, unknown>));
}

/** The skins the set-up wizard offers under "Your field". */
export async function fetchLiveSkins(): Promise<Skin[]> {
  const { data, error } = await supabase
    .from('verticals')
    .select(SKIN_COLUMNS)
    .eq('status', 'live')
    .eq('is_active', true)
    .order('sort_order')
    .order('id');
  if (error) throw new Error(`Failed to fetch skins: ${error.message}`);
  return (data ?? []).map((row) => parseSkinRow(row as Record<string, unknown>));
}

/** One skin by id (a studio's own skin, for its wording). Null when there is none. */
export async function fetchSkin(id: string): Promise<Skin | null> {
  const { data, error } = await supabase.from('verticals').select(SKIN_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to fetch skin: ${error.message}`);
  return data ? parseSkinRow(data as Record<string, unknown>) : null;
}

/** How many studios use each skin (platform owner only: reads every studio's skin). */
export async function fetchSkinUsage(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('tenants').select('skin');
  if (error) throw new Error(`Failed to count studios: ${error.message}`);
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { skin: string | null }[]) {
    if (row.skin) counts[row.skin] = (counts[row.skin] ?? 0) + 1;
  }
  return counts;
}

export async function saveSkin(skin: Skin, isNew: boolean): Promise<void> {
  const row = toSkinRow(skin);
  // display_name is kept in step with name_en by a trigger; it is still required on insert.
  const { error } = isNew
    ? await supabase.from('verticals').insert({ ...row, display_name: row.name_en })
    : await supabase.from('verticals').update(row).eq('id', skin.id);
  if (error) {
    if (error.code === '23505') throw new Error('skin_id_taken');
    throw new Error(error.message);
  }
}
