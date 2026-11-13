// @vitest-environment jsdom
/**
 * Leads onboarding and help: the "Get your first leads" checklist (progress
 * kept per studio on this device, ticked from the Get leads panel or by hand,
 * test enquiry ticks itself once a lead exists, hideable), the ⓘ help tips,
 * and the "How leads work" page.
 * Run: pnpm -C apps/web test leads-onboarding-help
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => {
      if (o?.returnObjects) return [`${k}.1`, `${k}.2`];
      return o && Object.keys(o).length ? `${k}(${Object.values(o).join(',')})` : k;
    },
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't-1' }) }));

import {
  effectiveDone,
  firstLeadsProgress,
  loadFirstLeads,
  markFirstLeadsStep,
  saveFirstLeads,
} from '@/features/crm/lib/firstLeads';
import { FirstLeadsChecklist } from '@/features/crm/components/FirstLeadsChecklist';
import { InfoTip } from '@/components/ui/InfoTip';
import LeadsHelpPage from '@/pages/LeadsHelpPage';

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
});

const renderChecklist = (leadCount = 0) =>
  render(
    <MemoryRouter>
      <FirstLeadsChecklist leadCount={leadCount} />
    </MemoryRouter>,
  );

describe('progress rules', () => {
  it('per studio, ignores unknown steps, counts the website as optional', () => {
    saveFirstLeads('t-1', { done: ['share_link', 'nonsense' as never], hidden: false });
    expect(loadFirstLeads('t-1').done).toEqual(['share_link']);
    expect(loadFirstLeads('t-2').done).toEqual([]);
    const done = effectiveDone({ done: ['share_link', 'instagram', 'poster', 'website'], hidden: false }, 0);
    expect(firstLeadsProgress(done)).toEqual({ done: 3, total: 4, complete: false });
    expect(firstLeadsProgress(effectiveDone({ done: ['share_link', 'instagram', 'poster'], hidden: false }, 1)).complete).toBe(true);
  });

  it('works when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadFirstLeads('t-1')).toEqual({ done: [], hidden: false });
  });
});

describe('Get your first leads', () => {
  it('lists the steps with the website as optional; progress counts four', () => {
    renderChecklist();
    expect(screen.getByRole('heading', { name: 'pages.crm.first_leads.title' })).toBeTruthy();
    expect(screen.getByText('pages.crm.first_leads.progress(0,4)')).toBeTruthy();
    for (const s of ['share_link', 'instagram', 'poster', 'test_enquiry', 'website']) {
      expect(screen.getByLabelText(new RegExp(`pages.crm.first_leads.step_${s}`))).toBeTruthy();
    }
    expect(screen.getByText('pages.crm.first_leads.optional')).toBeTruthy();
  });

  it('a step done in the Get leads panel ticks itself here', () => {
    renderChecklist();
    act(() => markFirstLeadsStep('t-1', 'instagram'));
    expect((screen.getByLabelText(/step_instagram/) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('pages.crm.first_leads.progress(1,4)')).toBeTruthy();
  });

  it('the test enquiry ticks itself once the studio has a lead', () => {
    renderChecklist(1);
    const box = screen.getByLabelText(/step_test_enquiry/) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(true);
  });

  it('steps can be ticked by hand, and the list hidden for good', () => {
    const { unmount } = renderChecklist();
    fireEvent.click(screen.getByLabelText(/step_poster/));
    expect(loadFirstLeads('t-1').done).toContain('poster');
    fireEvent.click(screen.getByRole('button', { name: 'pages.crm.first_leads.hide' }));
    expect(screen.queryByRole('heading', { name: 'pages.crm.first_leads.title' })).toBeNull();
    unmount();
    renderChecklist();
    expect(screen.queryByRole('heading', { name: 'pages.crm.first_leads.title' })).toBeNull();
  });

  it('"Show me" opens the Get leads section', () => {
    const details = document.createElement('details');
    details.id = 'get-leads';
    details.scrollIntoView = vi.fn();
    document.body.appendChild(details);
    renderChecklist();
    fireEvent.click(screen.getAllByRole('button', { name: 'pages.crm.first_leads.show_me' })[0]);
    expect(details.open).toBe(true);
    details.remove();
  });
});

describe('help', () => {
  it('ⓘ shows and hides its text, with aria-expanded; Escape closes', async () => {
    render(<InfoTip label="Help: Questions">Shorter forms get more enquiries.</InfoTip>);
    const button = screen.getByRole('button', { name: 'Help: Questions' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const popup = await screen.findByRole('dialog');
    expect(popup.textContent).toBe('Shorter forms get more enquiries.');
    expect(button.getAttribute('aria-controls')).toBe(popup.id);
    fireEvent.keyDown(document.activeElement ?? popup, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('ⓘ stays a small round button (not stretched by touch-target rules) and follows RTL', async () => {
    document.documentElement.dir = 'rtl';
    try {
      render(<InfoTip label="עזרה">טקסט</InfoTip>);
      const button = screen.getByRole('button', { name: 'עזרה' });
      expect(button.className).toContain('min-h-0');
      expect(button.className).toContain('h-5');
      fireEvent.click(button);
      expect((await screen.findByRole('dialog')).getAttribute('dir')).toBe('rtl');
    } finally {
      document.documentElement.dir = '';
    }
  });

  it('"How leads work" has the six sections with their steps', () => {
    render(
      <MemoryRouter>
        <LeadsHelpPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'pages.crm.help.title' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(6);
    expect(screen.getByText('pages.crm.help.privacy_steps.1')).toBeTruthy();
  });
});
