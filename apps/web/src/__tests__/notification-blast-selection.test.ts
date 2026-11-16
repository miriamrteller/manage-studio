/**
 * Notifications -> send email: only the recipients left ticked get the email
 * (the form sends their emails), a selection never adds anyone, and a lead
 * (no person record) can be picked by email.
 * Run: pnpm -C apps/web test notification-blast-selection
 */
import { describe, expect, it } from 'vitest';
import { applyBlastSelection } from '../../../../supabase/functions/send-notification/blast-selection.ts';

const rows = [
  { recipient_email: 'Ann@Example.test', person_id: 'p-ann' },
  { recipient_email: 'bob@example.test', person_id: 'p-bob' },
  { recipient_email: 'lead@example.test', person_id: null },
];

describe('applyBlastSelection', () => {
  it('no selection sends to everyone resolved', () => {
    expect(applyBlastSelection(rows, {})).toEqual({ rows });
  });

  it('sends only to the ticked emails, ignoring case and spaces', () => {
    const result = applyBlastSelection(rows, { selectedRecipientEmails: [' ann@example.test', 'lead@example.test'] });
    expect(result).toEqual({ rows: [rows[0], rows[2]] });
  });

  it('refuses an email that is not in the resolved list', () => {
    expect(applyBlastSelection(rows, { selectedRecipientEmails: ['someone@else.test'] })).toEqual({
      error: 'Invalid recipient selection',
    });
  });

  it('refuses an empty selection', () => {
    expect(applyBlastSelection(rows, { selectedRecipientEmails: [] })).toEqual({ error: 'No recipients selected' });
  });

  it('still accepts person ids, and a lead cannot be matched by a person id', () => {
    expect(applyBlastSelection(rows, { selectedPersonIds: ['p-bob'] })).toEqual({ rows: [rows[1]] });
    expect(applyBlastSelection(rows, { selectedPersonIds: ['nope'] })).toEqual({ error: 'Invalid recipient selection' });
  });
});
