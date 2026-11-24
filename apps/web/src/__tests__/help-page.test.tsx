// @vitest-environment jsdom
/**
 * Admin → Help (/admin/help): photographer guides, en + he complete, the
 * "Open this page" links go to real admin pages, and "Ask OpalSwift a
 * question" opens Send feedback on Help.
 * Run: pnpm -C apps/web test help-page
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import en from '@/i18n/en.json';
import he from '@/i18n/he.json';
import { HELP_TOPICS, helpTopicsFor } from '@/features/help/helpTopics';
import routerSource from '@/router.tsx?raw';

const openReportProblem = vi.fn();
let vertical = 'photographer';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o?.returnObjects ? [`${k}.1`, `${k}.2`] : k),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't-1', vertical }) }));
vi.mock('@/components/ReportProblem', () => ({
  useReportProblem: () => ({ canReport: true, openReportProblem }),
}));

import HelpPage from '@/pages/HelpPage';

type Topic = { title: string; summary: string; steps: string[] };
const enTopics = (en as unknown as { help: { topics: Record<string, Topic> } }).help.topics;
const heTopics = (he as unknown as { help: { topics: Record<string, Topic> } }).help.topics;

describe('help guides', () => {
  it('every guide has a title, summary and steps in English and Hebrew', () => {
    for (const { id } of HELP_TOPICS) {
      for (const topics of [enTopics, heTopics]) {
        expect(topics[id]?.title, id).toBeTruthy();
        expect(topics[id]?.summary, id).toBeTruthy();
        expect(topics[id]?.steps.length, id).toBeGreaterThan(0);
      }
      expect(heTopics[id].steps.length, id).toBe(enTopics[id].steps.length);
    }
    expect(Object.keys(enTopics).sort()).toEqual(Object.keys(heTopics).sort());
  });

  it('only shows a kind of business its own guides', () => {
    const photographer = helpTopicsFor('photographer');
    const dance = helpTopicsFor('dance-studio');
    expect(photographer.length).toBeGreaterThan(0);
    expect(dance.map((x) => x.id)).toContain('new_class');
    expect(photographer.some((x) => dance.includes(x))).toBe(false);
    expect(photographer.length + dance.length).toBe(HELP_TOPICS.length);
    expect(helpTopicsFor('generic')).toEqual([]);
    expect(helpTopicsFor(null)).toEqual([]);
  });

  it('links each guide to an admin page that exists in the router', () => {
    const router = routerSource as string;
    for (const { id, path } of HELP_TOPICS) {
      const route = path.slice(1);
      expect(router.includes(`path: "${route}"`) || router.includes(`path: '${route}'`), `${id} → ${path}`).toBe(true);
    }
  });
});

describe('HelpPage', () => {
  it('lists the guides with their steps and asks for help through Send feedback', () => {
    vertical = 'photographer';
    render(
      <MemoryRouter>
        <HelpPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'help.title' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'help.open_page' })).toHaveLength(helpTopicsFor('photographer').length);
    expect(screen.getAllByText('help.topics.packages.steps.1').length).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'help.ask_button' }));
    expect(openReportProblem).toHaveBeenCalledWith('help');
  });

  it('says so when there are no guides for this kind of business yet', () => {
    vertical = 'generic';
    render(
      <MemoryRouter>
        <HelpPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('help.none')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'help.ask_button' })).toBeTruthy();
  });
});
