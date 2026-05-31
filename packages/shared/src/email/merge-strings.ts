/**
 * Deep-merge template string objects (tenant overrides on base i18n).
 */
export function deepMergeStrings(
  target: Record<string, unknown>,
  source: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!source || Object.keys(source).length === 0) {
    return target;
  }

  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMergeStrings(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>,
      );
    } else {
      result[key] = sourceValue;
    }
  }

  return result;
}
