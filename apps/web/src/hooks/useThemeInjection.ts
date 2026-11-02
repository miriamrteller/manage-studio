import { useEffect } from 'react';
import { useTenant } from './useTenant';
import { deriveColorSystem, getAccessibleTextColor } from '../lib/utils';
import { injectFontPair } from './useFontLoader';
import { deriveSoftTheme } from '../lib/theme/deriveSoftTheme';
import { deriveNavTheme } from '../lib/theme/navTheme';
import { getDefaultTheme } from '../lib/theme/defaultTheme';

export function useThemeInjection(): void {
  const tenant = useTenant();
  useEffect(() => {
    if (!tenant) return;
    const root = document.documentElement;
    try {
      const whiteLabel = tenant.white_label;
      if (!whiteLabel) { console.warn('Tenant white_label config not found, using defaults'); return; }
      const primaryColor = whiteLabel.primary_color || getDefaultTheme().primary;
      const secondaryColor = whiteLabel.secondary_color || whiteLabel.accent_color || undefined;
      const colorSystem = deriveColorSystem(primaryColor, secondaryColor);
      Object.entries(colorSystem).forEach(([key, value]) => {
        const cssVarKey = key.split('_').join('-');
        root.style.setProperty(`--color-${cssVarKey}`, value);
      });
      root.style.setProperty('--color-on-secondary', getAccessibleTextColor(colorSystem.secondary));
      // Soft theme: luminance-targeted tints, tenant greys, contrast-safe brand
      // ink and button fill. The page ground (--color-bg-*) follows the tints
      // in index.css, replacing the old warm/cool off-white switch.
      const soft = deriveSoftTheme(colorSystem.primary, colorSystem.secondary);
      Object.entries(soft).forEach(([cssVar, value]) => {
        root.style.setProperty(cssVar, value);
      });
      Object.entries(deriveNavTheme(colorSystem.primary, colorSystem.secondary)).forEach(([cssVar, value]) => {
        root.style.setProperty(cssVar, value);
      });
      // Text on a solid primary sits on the fill, so it follows the fill.
      root.style.setProperty('--color-on-primary', soft['--color-on-primary-fill']);
      if (whiteLabel.logo?.url) {
        root.style.setProperty('--logo-url', `url(${whiteLabel.logo.url})`);
        if (whiteLabel.logo.height) root.style.setProperty('--logo-height', whiteLabel.logo.height);
      }
      if (whiteLabel.logo_dark?.url) {
        root.style.setProperty('--logo-dark-url', `url(${whiteLabel.logo_dark.url})`);
        if (whiteLabel.logo_dark.height) root.style.setProperty('--logo-dark-height', whiteLabel.logo_dark.height);
      }
      // 5. Inject font pair CSS custom properties
      injectFontPair(tenant.font_pair ?? 'reliable');
      console.log(`✅ White-label theme applied for "${tenant.name}"`);
    } catch (error) {
      console.error('Failed to inject theme:', error);
    }
  }, [tenant]);
}
