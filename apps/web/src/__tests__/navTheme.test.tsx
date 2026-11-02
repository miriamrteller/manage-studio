import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AA, WHITE, contrast, mix } from '@/lib/theme/color';
import { NAV_ACTIVE_ALPHA, deriveNavTheme } from '@/lib/theme/navTheme';
import { defaultThemeTokens } from '@/lib/theme/defaultTheme';
import { OpalSwiftLogoLink, OPALSWIFT_SITE_URL } from '@/components/OpalSwiftShell';

const EXTREMES = ['#ffffff', '#000000', '#ffff00', '#00ffff', '#ff0000', '#76335a', '#5b6cff', '#21d1c2', '#fefefe'];

describe('side menu theme', () => {
  it('is a dark base derived from the primary', () => {
    const t = deriveNavTheme('#5B6CFF', '#21D1C2');
    expect(t['--nav-base']).toBe(defaultThemeTokens()['--nav-base']);
    expect(contrast(WHITE, t['--nav-base'])).toBeGreaterThan(10);
    expect(t['--nav-base']).not.toBe('#5b6cff');
  });

  it('keeps white text AA on the base, the brightest glow point and active rows, for extreme colours', () => {
    for (const primary of EXTREMES) {
      for (const accent of EXTREMES) {
        const t = deriveNavTheme(primary, accent);
        for (const bg of [t['--nav-base'], t['--nav-corner'], mix(WHITE, t['--nav-corner'], NAV_ACTIVE_ALPHA)]) {
          expect(contrast(t['--nav-text'], bg), `${primary}/${accent} on ${bg}`).toBeGreaterThanOrEqual(AA);
        }
      }
    }
  });

  it('glow is a subtle tint toward the accent', () => {
    const t = deriveNavTheme('#76335a', '#e99ac4');
    expect(t['--nav-corner']).toBe(mix('#e99ac4', t['--nav-base'], 0.15));
  });

  it('a studio with its own colours gets its own menu', () => {
    expect(deriveNavTheme('#76335a', '#e99ac4')['--nav-base']).not.toBe(deriveNavTheme('#5B6CFF', '#21D1C2')['--nav-base']);
  });
});

describe('OpalSwift logo link', () => {
  it('links the OpalSwift logo to opalswift.com', () => {
    render(<OpalSwiftLogoLink />);
    expect(screen.getByRole('link', { name: /opalswift/i }).getAttribute('href')).toBe(OPALSWIFT_SITE_URL);
    expect(OPALSWIFT_SITE_URL).toBe('https://opalswift.com');
  });
});
