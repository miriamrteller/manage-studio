// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { RecipientPreviewTable } from '@/features/notifications-admin/components/RecipientPreviewTable';

afterEach(cleanup);

describe('RecipientPreviewTable empty state', () => {
  it('says "no one matches" by default', () => {
    render(<RecipientPreviewTable recipients={[]} selectedEmails={new Set()} onSelectedEmailsChange={() => {}} />);
    expect(screen.getByRole('status').textContent).toBe('pages.notifications.preview_empty');
  });

  it('shows the reason instead when one is given', () => {
    render(
      <RecipientPreviewTable
        recipients={[]}
        selectedEmails={new Set()}
        onSelectedEmailsChange={() => {}}
        emptyMessage="This account's contact has no email address on file."
      />,
    );
    expect(screen.getByRole('status').textContent).toBe("This account's contact has no email address on file.");
  });
});
