import { describe, expect, it } from 'vitest';
import { matchesVertical, navigationConfig } from '@/components/Navigation/navigationConfig';
import * as photographer from './seed';
import * as ballet from './ballet/seed';

/** Photographer-only pages: Shoots, quotes, contracts. */
const PHOTOGRAPHER_PAGES = /^#?\/admin\/(jobs|quotes)\b/;
const PHOTOGRAPHER_FEATURES = ['billing:delivery.gated', 'media:portfolio.public', 'media:storage.extended', 'ui:theme.photographer'];

const visiblePaths = (vertical: string) =>
  navigationConfig.filter((item) => matchesVertical(item, vertical as never)).map((item) => item.path);

describe('ballet demo shows no photographer features', () => {
  it('opens and switches views onto dance pages, never Shoots or quotes', () => {
    expect(ballet.DEMO_HOME.admin).not.toMatch(PHOTOGRAPHER_PAGES);
    expect(ballet.DEMO_HOME.client).not.toMatch(PHOTOGRAPHER_PAGES);
  });

  it('is a dance-studio tenant without photographer feature flags', () => {
    const tenant = ballet.buildSeed().tenants[0];
    expect(tenant.skin).toBe('dance-studio');
    for (const flag of PHOTOGRAPHER_FEATURES) expect(tenant.enabled_features).not.toContain(flag);
  });

  it('has no shoots, quotes or contract templates in its data', () => {
    const t = ballet.buildSeed();
    expect(t.job_details).toEqual([]);
    expect(t.quotes).toEqual([]);
    expect(t.offerings.every((o) => o.offering_type === 'class')).toBe(true);
  });

  it('the dance menu has no Shoots or quotes', () => {
    expect(visiblePaths('dance-studio').filter((p) => PHOTOGRAPHER_PAGES.test(p ?? ''))).toEqual([]);
  });
});

describe('photographer demo still shows its features', () => {
  it('opens on Shoots', () => {
    expect(photographer.DEMO_HOME.admin).toBe('#/admin/jobs');
  });

  it('the photographer menu has Shoots and quotes', () => {
    const paths = visiblePaths('photographer');
    expect(paths).toContain('/admin/jobs');
    expect(paths).toContain('/admin/quotes');
  });

  it('keeps its shoots and photographer theme', () => {
    const t = photographer.buildSeed();
    expect(t.tenants[0].skin).toBe('photographer');
    expect(t.job_details.length).toBeGreaterThan(0);
    expect(t.tenants[0].enabled_features).toContain('ui:theme.photographer');
  });
});
