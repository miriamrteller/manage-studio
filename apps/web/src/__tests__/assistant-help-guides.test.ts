/**
 * Ask OpalSwift answers from a copy of the help guides
 * (supabase/functions/_shared/help-guides.ts). It must match the guides the Help page shows.
 * If this fails, run: node scripts/build-help-guides.mjs
 * Run: pnpm -C apps/web test assistant-help-guides.test.ts
 */
import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import he from '@/i18n/he.json';
import { HELP_TOPICS } from '@/features/help/helpTopics';
import { tourFor } from '@/features/assistant/tours';
import { HELP_GUIDES } from '../../../../supabase/functions/_shared/help-guides';

describe('assistant help guides', () => {
  it('the server copy matches en.json and he.json (run node scripts/build-help-guides.mjs)', () => {
    expect(HELP_GUIDES.en).toEqual(en.help.topics);
    expect(HELP_GUIDES.he).toEqual(he.help.topics);
  });

  it('every guide has a tour with one stop per written step, starting on its page', () => {
    for (const topic of HELP_TOPICS) {
      const steps = (en.help.topics as Record<string, { steps: string[] }>)[topic.id].steps;
      const tour = tourFor(topic.id, steps.length);
      expect(tour, topic.id).not.toBeNull();
      expect(tour!.length).toBe(steps.length);
      expect(tour![0].path, topic.id).toBeTruthy();
    }
    expect(tourFor('no_such_guide', 3)).toBeNull();
  });
});
