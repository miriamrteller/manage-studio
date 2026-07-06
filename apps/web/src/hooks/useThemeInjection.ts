import { useEffect } from 'react';
import { useTenant } from './useTenant';
import {
  deriveColorSystem,
  getAccessibleTextColor,
  getBackgroundForPrimaryColor,
} from '../lib/utils';

/**
 * Theme Injection Hook
 *
 * Loads tenant's white-label config from Supabase and injects all CSS variables
 * at the :root level. No React state involved—just direct DOM manipulation of CSS.
 *
 * Flow:
 * 1. Load tenant's white_label config (primary_color, secondary_color, logo)
 * 2. Derive full color system from primary + optional secondary
 * 3. Detect warm vs cool background based on primary hue
 * 4. Inject all variables into document.documentElement.style
 * 5. Log success message for debugging
 *
 * Example:
 * Tenant white_label: { primary_color: '#76335a', secondary_color: '#e99ac4' }
 *   ↓
 * deriveColorSystem('#76335a', '#e99ac4')
 *   → { primary: '#76335a', primary_light: '#...', secondary: '#e99ac4', ... }
 *   ↓
 * getBackgroundForPrimaryColor('#76335a')
 *   → 'cool' (hue ~325° detected as cool)
 *   ↓
 * Inject:
 *   --color-primary: #76335a
 *   --color-secondary: #e99ac4
 *   --color-bg-primary: var(--color-bg-primary-cool)
 *   ... (30+ variables total)
 */
export function useThemeInjection(): void {
  const tenant = useTenant();

  useEffect(() => {
    if (!tenant) return;

    const root = document.documentElement;

    try {
      // Get white-label config from tenant (or use defaults if not provided)
      const whiteLabel = tenant.white_label;

      if (!whiteLabel) {
        console.warn('Tenant white_label config not found, using defaults');
        return;
      }

      const primaryColor = whiteLabel.primary_color || '#2563eb';
      const secondaryColor =
        whiteLabel.secondary_color || whiteLabel.accent_color || undefined;

      // 1. Derive full color system from primary + optional secondary/accent
      const colorSystem = deriveColorSystem(primaryColor, secondaryColor);

      // 2. Inject all derived colors into :root
      Object.entries(colorSystem).forEach(([key, value]) => {
        // `deriveColorSystem` keys use underscores (primary_hover, neutral_100);
        // CSS variables across the app are hyphenated (--color-primary-hover, --color-neutral-100).
        const cssVarKey = key.replaceAll('_', '-');
        root.style.setProperty(`--color-${cssVarKey}`, value);
      });

      // 2b. Inject accessible text colors for primary/secondary surfaces
      root.style.setProperty(
        '--color-on-primary',
        getAccessibleTextColor(primaryColor)
      );
      root.style.setProperty(
        '--color-on-secondary',
        getAccessibleTextColor(colorSystem.secondary)
      );

      // 3. Detect warm vs cool background and set
      const bgVariant = getBackgroundForPrimaryColor(primaryColor);
      if (bgVariant === 'warm') {
        root.style.setProperty(
          '--color-bg-primary',
          'var(--color-bg-primary-warm)'
        );
        root.style.setProperty(
          '--color-bg-secondary',
          'var(--color-bg-secondary-warm)'
        );
      } else {
        root.style.setProperty(
          '--color-bg-primary',
          'var(--color-bg-primary-cool)'
        );
        root.style.setProperty(
          '--color-bg-secondary',
          'var(--color-bg-secondary-cool)'
        );
      }

      // 4. Inject logo URLs (if provided)
      if (whiteLabel.logo?.url) {
        root.style.setProperty('--logo-url', `url(${whiteLabel.logo.url})`);
        if (whiteLabel.logo.height) {
          root.style.setProperty('--logo-height', whiteLabel.logo.height);
        }
      }

      if (whiteLabel.logo_dark?.url) {
        root.style.setProperty(
          '--logo-dark-url',
          `url(${whiteLabel.logo_dark.url})`
        );
        if (whiteLabel.logo_dark.height) {
          root.style.setProperty('--logo-dark-height', whiteLabel.logo_dark.height);
        }
      }

      console.log(
        `✅ White-label theme applied for "${tenant.name}" (${bgVariant} background, primary: ${primaryColor})`
      );
    } catch (error) {
      console.error('Failed to inject theme:', error);
    }
  }, [tenant]);
}
