/**
 * Deep-merge template string objects (tenant overrides on base i18n).
 */
export function deepMergeStrings(target, source) {
    if (!source || Object.keys(source).length === 0) {
        return target;
    }
    const result = { ...target };
    for (const key of Object.keys(source)) {
        const sourceValue = source[key];
        const targetValue = result[key];
        if (sourceValue !== null &&
            typeof sourceValue === 'object' &&
            !Array.isArray(sourceValue) &&
            targetValue !== null &&
            typeof targetValue === 'object' &&
            !Array.isArray(targetValue)) {
            result[key] = deepMergeStrings(targetValue, sourceValue);
        }
        else {
            result[key] = sourceValue;
        }
    }
    return result;
}
