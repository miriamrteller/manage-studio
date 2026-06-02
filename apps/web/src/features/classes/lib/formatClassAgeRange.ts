import type { TFunction } from 'i18next';

export function formatClassAgeRange(
  t: TFunction,
  minAge?: number | null,
  maxAge?: number | null,
): string | null {
  if (minAge != null && maxAge != null) {
    return t('pages.classes.ages_range', { min: minAge, max: maxAge });
  }
  if (minAge != null) {
    return t('pages.classes.ages_min_only', { min: minAge });
  }
  if (maxAge != null) {
    return t('pages.classes.ages_max_only', { max: maxAge });
  }
  return null;
}
