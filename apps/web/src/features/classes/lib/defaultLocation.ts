/**
 * Default location for a NEW class (prefill rule: never ask blank what we already know).
 * The studio's most used class location; failing that, its business address from the
 * legal profile. Always just a starting value — the field stays editable.
 */

/** The most common non-empty location (trimmed, case-insensitive); ties go to the first seen. */
export function mostCommonLocation(locations: ReadonlyArray<string | null | undefined>): string | null {
  const counts = new Map<string, { label: string; count: number; first: number }>();
  locations.forEach((raw, index) => {
    const label = typeof raw === 'string' ? raw.trim() : '';
    if (!label) return;
    const key = label.toLocaleLowerCase();
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { label, count: 1, first: index });
  });
  let best: { label: string; count: number; first: number } | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count || (entry.count === best.count && entry.first < best.first)) {
      best = entry;
    }
  }
  return best?.label ?? null;
}

export function defaultClassLocation(
  existingLocations: ReadonlyArray<string | null | undefined>,
  studioAddress: string | null | undefined,
): string | null {
  return mostCommonLocation(existingLocations) ?? (studioAddress?.trim() || null);
}
