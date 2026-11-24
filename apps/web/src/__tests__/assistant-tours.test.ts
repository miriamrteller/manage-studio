/**
 * "Show me how" tours: every highlighted element exists in the app (data-tour), and
 * the page check honours the tab in the query.
 * Run: pnpm -C apps/web test assistant-tours.test.ts
 */
import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import { HELP_TOPICS } from '@/features/help/helpTopics';
import { isOnPath, tourFor } from '@/features/assistant/tours';

const sources = import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;
const allSource = Object.values(sources).join('\n');

describe('assistant tours', () => {
  it('every tour target is marked with data-tour somewhere in the app', () => {
    for (const topic of HELP_TOPICS) {
      const count = (en.help.topics as Record<string, { steps: string[] }>)[topic.id].steps.length;
      for (const step of tourFor(topic.id, count) ?? []) {
        if (!step.target) continue;
        const tab = step.target.match(/^photo-shop-tab-(.+)$/);
        if (tab) {
          expect(allSource).toContain('data-tour={`photo-shop-tab-${k}`}');
          expect(allSource).toContain(`'${tab[1]}'`);
        } else {
          expect(allSource, step.target).toContain(`data-tour="${step.target}"`);
        }
      }
    }
  });

  it('matches the page, and the query only when the step names one', () => {
    expect(isOnPath('/admin/projects', { pathname: '/admin/projects', search: '' })).toBe(true);
    expect(isOnPath('/admin/projects', { pathname: '/admin/people', search: '' })).toBe(false);
    expect(isOnPath('/admin/shop/photos?tab=smugmug', { pathname: '/admin/shop/photos', search: '?tab=smugmug' })).toBe(true);
    expect(isOnPath('/admin/shop/photos?tab=smugmug', { pathname: '/admin/shop/photos', search: '' })).toBe(false);
    expect(isOnPath('/admin/shop/photos', { pathname: '/admin/shop/photos', search: '?tab=prices' })).toBe(true);
  });
});
