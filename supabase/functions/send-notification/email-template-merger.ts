/**
 * Email Template Merger Utility
 * Merges base email template strings with tenant-specific overrides
 * Pure function — unit testable, no side effects
 * Adheres to SPEC.md 1.3: Fail loudly, fail safely
 *
 * Pattern: Code defaults (base) + DB overrides (tenant-specific)
 * Tenant overrides win; everything else uses code defaults
 * If override is undefined/null, falls back to base
 */

import { z } from 'zod';

/**
 * Merge base template strings with tenant overrides
 * @param baseStrings - Base template strings from code (i18n JSON)
 * @param overrides - Tenant-specific overrides (from DB), optional
 * @returns Merged result with overrides applied, base values for missing keys
 *
 * Example:
 * base = { greeting: "Hello,", cta: "Sign Up" }
 * overrides = { greeting: "Welcome!" }
 * result = { greeting: "Welcome!", cta: "Sign Up" }
 */
export function mergeTemplateOverrides(
  baseStrings: Record<string, unknown>,
  overrides?: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!overrides || Object.keys(overrides).length === 0) {
    // No overrides — return base unchanged
    return baseStrings;
  }

  // Deep merge: overrides on top of base
  // This handles nested objects (e.g., context_labels, context_messages)
  const merged = deepMerge(baseStrings, overrides);

  return merged;
}

/**
 * Deep merge two objects
 * Recursively merges overlapping keys, preferring source values
 * @param target - Base/default values
 * @param source - Override values
 * @returns Merged object with source values layered on top
 *
 * Example:
 * deepMerge(
 *   { labels: { en: "Hello", he: "שלום" }, cta: "Sign Up" },
 *   { labels: { en: "Hi" } }
 * )
 * // Returns: { labels: { en: "Hi", he: "שלום" }, cta: "Sign Up" }
 */
export function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];

      // If both target and source have the same key and both are objects, merge recursively
      if (
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        result[key] !== null &&
        typeof result[key] === 'object' &&
        !Array.isArray(result[key])
      ) {
        result[key] = deepMerge(
          result[key] as Record<string, unknown>,
          sourceValue as Record<string, unknown>,
        );
      } else {
        // Otherwise, override with source value (or null/undefined to remove)
        result[key] = sourceValue;
      }
    }
  }

  return result;
}

/**
 * Validate override structure matches base template shape
 * Helpful for debugging invalid overrides (e.g., typos in field names)
 * @param baseStrings - Base template strings from code
 * @param overrides - Proposed overrides
 * @returns Object with validation results { isValid, errors }
 *
 * Example:
 * const result = validateOverrides(baseStrings, { typo_field: "value" });
 * // result.errors = ["Unknown field: typo_field"]
 */
export function validateOverrides(
  baseStrings: Record<string, unknown>,
  overrides: Record<string, unknown>,
): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const validKeys = Object.keys(baseStrings);

  for (const key in overrides) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      // Check if this key exists in base
      if (!validKeys.includes(key)) {
        errors.push(`Unknown field in overrides: "${key}"`);
      } else {
        // If base has a nested object, check that override doesn't introduce new keys
        const baseValue = baseStrings[key];
        const overrideValue = overrides[key];

        if (
          baseValue !== null &&
          typeof baseValue === 'object' &&
          !Array.isArray(baseValue) &&
          overrideValue !== null &&
          typeof overrideValue === 'object' &&
          !Array.isArray(overrideValue)
        ) {
          // Recursively validate nested structure
          const nestedValidation = validateOverrides(
            baseValue as Record<string, unknown>,
            overrideValue as Record<string, unknown>,
          );

          if (!nestedValidation.isValid) {
            errors.push(
              `Nested validation failed for "${key}": ${nestedValidation.errors.join(', ')}`,
            );
          }
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Type-safe override merger with Zod validation
 * Ensures overrides are plain objects (no functions, etc.)
 */
const OverridesSchema = z.record(z.unknown()).nullable().optional();

export function mergeWithValidation(
  baseStrings: Record<string, unknown>,
  overrides: unknown,
): Record<string, unknown> {
  const validatedOverrides = OverridesSchema.parse(overrides);

  if (!validatedOverrides) {
    return baseStrings;
  }

  // Optionally, validate structure (helpful for catching field typos)
  const validation = validateOverrides(baseStrings, validatedOverrides);

  if (!validation.isValid) {
    console.warn('Email template override validation warnings:', validation.errors);
    // Don't throw — just warn and proceed (fail safe)
  }

  return mergeTemplateOverrides(baseStrings, validatedOverrides);
}
