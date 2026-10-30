/**
 * The WhatsApp pay-link button reads the client phone from
 * contact_preferences.whatsapp_number (not people.emergency_contact_phone).
 * Run: pnpm -C apps/web test job-contact.test.ts
 */
import { describe, it, expect } from 'vitest';
import { JOB_CONTACT_SELECT, jobContactFromRow } from '@/features/jobs/lib/jobContact';

describe('jobContactFromRow', () => {
  it('selects the phone through contact_preferences, not people.emergency_contact_phone', () => {
    expect(JOB_CONTACT_SELECT).toContain('contact_preferences(whatsapp_number)');
    expect(JOB_CONTACT_SELECT).not.toContain('emergency_contact_phone');
  });

  it('reads whatsapp_number when the preference row is embedded as an object', () => {
    expect(
      jobContactFromRow({
        booked_starts_at: '2026-11-10T16:00:00Z',
        people: { contact_preferences: { whatsapp_number: '052-1234567' } },
      }),
    ).toEqual({ bookedStartsAt: '2026-11-10T16:00:00Z', phone: '052-1234567' });
  });

  it('reads whatsapp_number when the preference row is embedded as an array', () => {
    expect(
      jobContactFromRow({ people: [{ contact_preferences: [{ whatsapp_number: '+972521234567' }] }] }).phone,
    ).toBe('+972521234567');
  });

  it('yields null phone when there is no preference row or it is blank', () => {
    expect(jobContactFromRow({ people: { contact_preferences: [] } }).phone).toBeNull();
    expect(jobContactFromRow({ people: { contact_preferences: { whatsapp_number: '  ' } } }).phone).toBeNull();
    expect(jobContactFromRow(null)).toEqual({ bookedStartsAt: null, phone: null });
  });
});
