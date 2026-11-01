// @vitest-environment jsdom
/**
 * Legal minimum on public forms: tenant sites show the studio's own privacy / terms /
 * accessibility pages (never the env URLs), the privacy notice links the right policy, and
 * the enrolment-terms gate records acceptance before payment.
 * Run: pnpm -C apps/web test legal-links.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { resolveLegalLinks } from '../lib/legalLinks';
import { LegalFooterLinks } from '../components/LegalFooterLinks';
import { PrivacyNotice } from '../components/legal/PrivacyNotice';
import { EnrolmentTermsGate } from '../features/enrolment/components/EnrolmentTermsGate';

const { invoke, tenantRef } = vi.hoisted(() => ({
  invoke: vi.fn(),
  tenantRef: { current: null as Record<string, unknown> | null },
}));

vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => tenantRef.current }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
    i18n: { language: 'en' },
  }),
}));

afterEach(() => {
  cleanup();
  invoke.mockReset();
  tenantRef.current = null;
});

const env = { privacy: 'https://opalswift.com/privacy', terms: 'https://opalswift.com/terms', accessibility: '' };

describe('resolveLegalLinks', () => {
  it('uses the tenant pages on a tenant site and never the env URLs', () => {
    const links = resolveLegalLinks(
      { privacy_policy_url: 'https://ballet.example/privacy', terms_url: null, accessibility_url: '  ' },
      env,
    );
    expect(links).toEqual({ privacy: 'https://ballet.example/privacy', terms: null, accessibility: null });
  });

  it('falls back to the env URLs on the root site only', () => {
    expect(resolveLegalLinks(null, env)).toEqual({
      privacy: 'https://opalswift.com/privacy',
      terms: 'https://opalswift.com/terms',
      accessibility: null,
    });
  });
});

describe('LegalFooterLinks', () => {
  it('renders privacy, terms and accessibility links of the studio', () => {
    tenantRef.current = {
      privacy_policy_url: 'https://ballet.example/privacy',
      terms_url: 'https://ballet.example/terms',
      accessibility_url: 'https://ballet.example/a11y',
    };
    render(<LegalFooterLinks />);
    const nav = screen.getByRole('navigation', { name: 'footer.legal_nav' });
    const links = nav.querySelectorAll('a');
    expect(Array.from(links).map((a) => a.getAttribute('href'))).toEqual([
      'https://ballet.example/privacy',
      'https://ballet.example/terms',
      'https://ballet.example/a11y',
    ]);
  });

  it('renders nothing when the studio has not published any page', () => {
    tenantRef.current = { privacy_policy_url: null, terms_url: null, accessibility_url: null };
    const { container } = render(<LegalFooterLinks />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PrivacyNotice', () => {
  it('names the purpose and links the studio policy', () => {
    tenantRef.current = { privacy_policy_url: 'https://ballet.example/privacy' };
    render(<PrivacyNotice purpose="inquiry" />);
    const notice = screen.getByTestId('privacy-notice');
    expect(notice).toHaveTextContent('legal.privacy_notice.inquiry');
    expect(screen.getByRole('link', { name: 'legal.privacy_policy' })).toHaveAttribute(
      'href',
      'https://ballet.example/privacy',
    );
  });

  it('still shows the notice text when no policy URL is set', () => {
    tenantRef.current = { privacy_policy_url: null };
    render(<PrivacyNotice purpose="enrolment" />);
    expect(screen.getByTestId('privacy-notice')).toHaveTextContent('legal.privacy_notice.enrolment');
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('EnrolmentTermsGate', () => {
  const props = {
    engagementId: 'eng-1',
    termsUrl: 'https://ballet.example/terms',
    privacyUrl: 'https://ballet.example/privacy',
  };

  it('is unticked by default and refuses to continue until ticked', async () => {
    const onAccepted = vi.fn();
    render(<EnrolmentTermsGate {...props} onAccepted={onAccepted} />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'legal.terms_continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('legal.terms_required');
    expect(invoke).not.toHaveBeenCalled();
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it('records the acceptance with the guest token, then continues', async () => {
    invoke.mockResolvedValue({ data: { ok: true, acceptedAt: '2026-11-01T00:00:00Z', version: '1' }, error: null });
    const onAccepted = vi.fn();
    render(<EnrolmentTermsGate {...props} enrolmentToken="tok" onAccepted={onAccepted} />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'legal.terms_continue' }));
    await waitFor(() => expect(onAccepted).toHaveBeenCalledTimes(1));
    expect(invoke).toHaveBeenCalledWith('accept-enrolment-terms', {
      body: { engagement_id: 'eng-1', enrolment_token: 'tok' },
      headers: { Authorization: 'WaiverToken tok' },
    });
    expect(screen.getByRole('link', { name: 'legal.terms_link' })).toHaveAttribute('href', props.termsUrl);
    expect(screen.getByRole('link', { name: 'legal.privacy_policy' })).toHaveAttribute('href', props.privacyUrl);
  });

  it('shows the server error and does not continue', async () => {
    invoke.mockResolvedValue({ data: { error: 'Engagement is not open for acceptance' }, error: null });
    const onAccepted = vi.fn();
    render(<EnrolmentTermsGate {...props} onAccepted={onAccepted} />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'legal.terms_continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Engagement is not open for acceptance');
    expect(onAccepted).not.toHaveBeenCalled();
  });
});
