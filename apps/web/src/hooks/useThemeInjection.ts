import { useEffect } from 'react';
import { useTenant } from './useTenant';
import { deriveColorSystem, getAccessibleTextColor, getBackgroundForPrimaryColor } from '../lib/utils';
import { injectFontPair } from './useFontLoader';

export function useThemeInjection(): void {
  const tenant = useTenant();
  useEffect(() => {
    if (!tenant) return;
    const root = document.documentElement;
    try {
      const whiteLabel = tenant.white_label;
      if (!whiteLabel) { console.warn('Tenant white_label config not found, using defaults'); return; }
      const primaryColor = whiteLabel.primary_color || '#2563eb';
      const secondaryColor = whiteLabel.secondary_color || whiteLabel.accent_color || undefined;
      const colorSystem = deriveColorSystem(primaryColor, secondaryColor);
      Object.entries(colorSystem).forEach(([key, value]) => {
        const cssVarKey = key.split('_').join('-');
        root.style.setProperty(`--color-${cssVarKey}`, value);
      });
      root.style.setProperty('--color-on-primary', getAccessibleTextColor(primaryColor));
      root.style.setProperty('--color-on-secondary', getAccessibleTextColor(colorSystem.secondary));
      const bgVariant = getBackgroundForPrimaryColor(primaryColor);
      if (bgVariant === 'warm') {
        root.style.setProperty('--color-bg-primary', 'var(--color-bg-primary-warm)');
        root.style.setProperty('--color-bg-secondary', 'var(--color-bg-secondary-warm)');
      } else {
        root.style.setProperty('--color-bg-primary', 'var(--color-bg-primary-cool)');
        root.style.setProperty('--color-bg-secondary', 'var(--color-bg-secondary-cool)');
      }
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
