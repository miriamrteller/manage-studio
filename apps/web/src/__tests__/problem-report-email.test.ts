import { describe, expect, it } from 'vitest';
import {
  buildProblemReportEmail,
  DEFAULT_PROBLEM_REPORT_TO,
  sentryEventUrl,
} from '../../../../supabase/functions/_shared/problem-report-email.ts';

const EVENT = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

const base = {
  studioName: 'Creative Ballet',
  subdomain: 'creativeballet',
  message: 'Save does nothing on the booking page',
  route: '/admin/setup/booking',
  eventId: EVENT,
  sentAt: '2026-11-04T10:00:00.000Z',
};

describe('problem report email to the owner', () => {
  it('goes to the owner by default', () => {
    expect(DEFAULT_PROBLEM_REPORT_TO).toBe('admin@opalswift.com');
  });

  it('has the studio, page, time, message and a link to the Sentry event', () => {
    const mail = buildProblemReportEmail(base);
    expect(mail.subject).toBe('Problem report: Creative Ballet');
    for (const part of ['Creative Ballet (creativeballet)', '/admin/setup/booking', '2026-11-04T10:00:00.000Z', 'Save does nothing on the booking page']) {
      expect(mail.html).toContain(part);
      expect(mail.text).toContain(part);
    }
    expect(mail.html).toContain(`https://opalswift.sentry.io/organizations/opalswift/eventids/${EVENT}/`);
  });

  it('escapes anything typed so it cannot inject markup', () => {
    const mail = buildProblemReportEmail({ ...base, message: '<script>alert(1)</script> & "x"', studioName: '<b>Evil</b>' });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<b>Evil</b>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('keeps the subject on one line', () => {
    const mail = buildProblemReportEmail({ ...base, studioName: 'Studio\r\nBcc: x@y.test' });
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });

  it('only links a real 32-character Sentry event id', () => {
    expect(sentryEventUrl('javascript:alert(1)')).toBeNull();
    expect(sentryEventUrl('abc')).toBeNull();
    expect(sentryEventUrl(null)).toBeNull();
    expect(sentryEventUrl(EVENT.toUpperCase())).toBe(`https://opalswift.sentry.io/organizations/opalswift/eventids/${EVENT}/`);
    const mail = buildProblemReportEmail({ ...base, eventId: 'not-an-id' });
    expect(mail.html).not.toContain('Open the report in Sentry');
  });

  it('cuts a very long message', () => {
    const mail = buildProblemReportEmail({ ...base, message: 'x'.repeat(5000) });
    expect(mail.text.length).toBeLessThan(2500);
  });
});
