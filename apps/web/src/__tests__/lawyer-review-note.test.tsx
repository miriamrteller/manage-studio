// @vitest-environment jsdom
/**
 * LawyerReviewNote — shown while the studio's legal pages are published,
 * dismissible per document version and per studio.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { LawyerReviewNote } from '../components/legal/LawyerReviewNote';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

beforeEach(() => window.localStorage.clear());
afterEach(() => cleanup());

describe('LawyerReviewNote', () => {
  it('shows the note for a published version', () => {
    render(<LawyerReviewNote tenantId="t1" version="v1" />);
    expect(screen.getByText('legal.settings.lawyer_note')).toBeTruthy();
  });

  it('shows nothing until the version is known', () => {
    render(<LawyerReviewNote tenantId="t1" version={null} />);
    expect(screen.queryByTestId('lawyer-review-note')).toBeNull();
  });

  it('dismisses for this version only, and remembers it', () => {
    const { unmount } = render(<LawyerReviewNote tenantId="t1" version="v1" />);
    fireEvent.click(screen.getByText('legal.settings.lawyer_note_dismiss'));
    expect(screen.queryByTestId('lawyer-review-note')).toBeNull();
    unmount();

    render(<LawyerReviewNote tenantId="t1" version="v1" />);
    expect(screen.queryByTestId('lawyer-review-note')).toBeNull();
    cleanup();

    render(<LawyerReviewNote tenantId="t1" version="v2" />);
    expect(screen.getByTestId('lawyer-review-note')).toBeTruthy();
  });

  it('is per studio', () => {
    render(<LawyerReviewNote tenantId="t1" version="v1" />);
    fireEvent.click(screen.getByText('legal.settings.lawyer_note_dismiss'));
    cleanup();
    render(<LawyerReviewNote tenantId="t2" version="v1" />);
    expect(screen.getByTestId('lawyer-review-note')).toBeTruthy();
  });
});
