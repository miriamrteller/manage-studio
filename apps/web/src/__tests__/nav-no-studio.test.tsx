// @vitest-environment jsdom
/**
 * Menu without a studio (app.opalswift.com): a signed-in super_admin sees only
 * platform items (Studios, Set up a new studio, Platform features), never studio
 * pages such as Classes. On a studio host nothing changes.
 * Run: pnpm -C apps/web test nav-no-studio.test.tsx
 */
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import i18n from '@/i18n/i18n';
import { useNavItems } from '@/components/Navigation/useNavItems';
import { navigationConfig, resolveActiveNavPath } from '@/components/Navigation/navigationConfig';

const paths = (sections: { items: { path: string }[] }[]) => sections.flatMap((s) => s.items.map((i) => i.path));

function nav(opts: { roles: string[]; hasStudio: boolean; authenticated?: boolean }) {
  return renderHook(() =>
    useNavItems({
      userRoles: opts.roles,
      isAuthenticated: opts.authenticated ?? true,
      hasStudio: opts.hasStudio,
      hasFeature: () => true,
    }),
  ).result.current.sections;
}

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('menu without a studio', () => {
  it('a super_admin sees only the platform items', () => {
    const sections = nav({ roles: ['super_admin'], hasStudio: false });
    expect(sections.map((s) => s.sectionKey)).toEqual(['platform']);
    expect(paths(sections)).toEqual(['/', '/platform/onboard', '/platform/features', '/platform/skins']);
  });

  it('even with studio roles, no studio pages show without a studio', () => {
    const sections = nav({ roles: ['super_admin', 'tenant_admin'], hasStudio: false });
    expect(paths(sections)).not.toContain('/classes');
    expect(paths(sections)).not.toContain('/admin/students');
  });

  it('on a studio host nothing changes; "Studios" (the platform home) is not shown', () => {
    const sections = nav({ roles: ['super_admin', 'tenant_admin'], hasStudio: true });
    expect(paths(sections)).not.toContain('/classes'); // a studio admin's menu has no public Browse pages
    expect(paths(sections)).toContain('/admin/students');
    expect(paths(sections)).toContain('/platform/onboard');
    expect(paths(sections)).not.toContain('/');
  });

  it('signed-out visitors see only Log in and Sign up (no studio pages like Classes)', () => {
    const sections = nav({ roles: [], hasStudio: false, authenticated: false });
    expect(paths(sections)).toEqual(['/login', '/signup']);
  });

  it('signed-out visitors on a studio host keep the full public menu', () => {
    const sections = nav({ roles: [], hasStudio: true, authenticated: false });
    expect(paths(sections)).toEqual(expect.arrayContaining(['/classes', '/login', '/signup']));
  });

  it('"/" highlights Studios without a studio, Home on a studio host', () => {
    const platformItems = navigationConfig.filter((i) => i.sectionKey === 'platform');
    expect(resolveActiveNavPath('/', platformItems)).toBe('/');
    const studioItems = navigationConfig.filter((i) => !i.withoutStudioOnly);
    expect(resolveActiveNavPath('/', studioItems)).toBe('/');
    expect(resolveActiveNavPath('/classes', studioItems)).toBe('/classes');
  });

  it('labels in English and Hebrew', async () => {
    expect([i18n.t('nav.platform_studios'), i18n.t('nav.platform_onboard'), i18n.t('nav.platform_features')]).toEqual([
      'Studios', 'Set up a new studio', 'Platform features',
    ]);
    await i18n.changeLanguage('he');
    expect([i18n.t('nav.platform_studios'), i18n.t('nav.platform_onboard'), i18n.t('nav.platform_features')]).toEqual([
      'סטודיואים', 'הקמת סטודיו חדש', 'תכונות הפלטפורמה',
    ]);
  });
});
