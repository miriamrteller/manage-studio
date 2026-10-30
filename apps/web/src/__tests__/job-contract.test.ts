/**
 * Job contract merge-field rendering (shared by get-waiver-engagement and
 * accept-waiver). Both sides must render identically so wording_snapshot and
 * consent_version_hash cover the text the client actually saw.
 */
import { describe, expect, it } from 'vitest';
import {
  formatJobDate,
  formatJobPrice,
  renderJobContract,
} from '../../../../supabase/functions/_shared/job-contract.ts';

const FIELDS = {
  client_name: 'נועה ואיתי לוי',
  shoot_date: 'Friday 13 November 2026 at 14:30',
  location: 'HaYarkon Park',
  package: 'Family Lifestyle Session',
  price: '₪520.00',
};

describe('renderJobContract', () => {
  it('replaces every known merge field, with or without inner spaces', () => {
    const out = renderJobContract(
      'Client: {{client_name}} / {{ package }} on {{SHOOT_DATE}} at {{location}} for {{price}}',
      FIELDS,
    );
    expect(out).toBe(
      'Client: נועה ואיתי לוי / Family Lifestyle Session on Friday 13 November 2026 at 14:30 at HaYarkon Park for ₪520.00',
    );
  });

  it('leaves unknown fields visible rather than silently blanking them', () => {
    expect(renderJobContract('Hello {{client_name}}, ref {{invoice_no}}', FIELDS)).toBe(
      'Hello נועה ואיתי לוי, ref {{invoice_no}}',
    );
  });

  it('is deterministic for the same inputs', () => {
    const template = '{{client_name}}\n{{shoot_date}}\n{{price}}';
    expect(renderJobContract(template, FIELDS)).toBe(renderJobContract(template, FIELDS));
  });

  it('returns plain templates untouched', () => {
    expect(renderJobContract('No fields here.', FIELDS)).toBe('No fields here.');
  });
});

describe('formatJobDate / formatJobPrice', () => {
  it('uses a language-specific placeholder when the shoot is not scheduled', () => {
    expect(formatJobDate(null, 'he')).toBe('טרם נקבע');
    expect(formatJobDate(null, 'en')).toBe('To be scheduled');
  });

  it('formats a scheduled date in Asia/Jerusalem', () => {
    const out = formatJobDate('2026-11-13T12:30:00Z', 'en');
    expect(out).toContain('13 November 2026');
    expect(out).toContain('14:30');
  });

  it('formats minor units as currency and dashes a missing price', () => {
    expect(formatJobPrice(52000, 'ILS', 'en')).toContain('520');
    expect(formatJobPrice(null, 'ILS', 'en')).toBe('—');
  });
});
