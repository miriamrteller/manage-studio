/**
 * Missing tax-doc watchdog + admin invoice email retry.
 * Run: pnpm -C apps/web test check-missing-documents.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../supabase/functions/_shared/resend-client.ts', () => ({
  sendHtmlEmail: vi.fn(async () => ({ id: 'email-1' })),
}));

vi.mock('../../../../supabase/functions/_shared/enrolment-recipient.ts', () => ({
  resolveTenantAdminNotificationEmails: vi.fn(async () => ['admin@studio.test']),
}));

vi.mock('../../../../supabase/functions/_shared/notification-from.ts', () => ({
  resolveNotificationFromEmail: vi.fn(() => 'noreply@studio.test'),
}));

import { sendHtmlEmail } from '../../../../supabase/functions/_shared/resend-client.ts';
import {
  PAYMENT_DOCUMENT_MISSING_ALERT_SENT,
  runCheckMissingDocuments,
} from '../../../../supabase/functions/_shared/payments/check-missing-documents.ts';
import { PAYMENT_DOCUMENT_ADMIN_EMAIL_SENT } from '../../../../supabase/functions/_shared/payments/send-payment-document-admin-email.ts';

const TENANT_ID = '00000000-0000-0000-0000-0000000000aa';
const PAYMENT_MISSING = 'pay-missing';
const PAYMENT_DOCUMENTED = 'pay-documented';

describe('runCheckMissingDocuments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('alerts admins for succeeded payments without documents past grace', async () => {
    const audits: Record<string, unknown>[] = [];
    const existingSent = new Set<string>();

    const service = {
      from: (table: string) => {
        if (table === 'payments') {
          return {
            select: () => ({
              eq: (_c: string, status: string) => {
                if (status === 'succeeded') {
                  return {
                    is: () => ({
                      lt: () => ({
                        order: () => ({
                          limit: async () => ({
                            data: [
                              {
                                id: PAYMENT_MISSING,
                                tenant_id: TENANT_ID,
                                total_amount_minor: 24000,
                                currency: 'ILS',
                                paid_at: '2026-07-01T00:00:00Z',
                                provider: 'invoice4u',
                                engagement_id: 'eng-1',
                                offering_id: null,
                              },
                            ],
                            error: null,
                          }),
                        }),
                      }),
                    }),
                    not: () => ({
                      order: () => ({
                        limit: async () => ({
                          data: [],
                          error: null,
                        }),
                      }),
                    }),
                  };
                }
                return {};
              },
            }),
          };
        }
        if (table === 'audit_log') {
          return {
            select: () => ({
              eq: () => ({
                eq: (_a: string, action: string) => ({
                  eq: (_e: string, entityId: string) => ({
                    limit: () => ({
                      maybeSingle: async () => ({
                        data: existingSent.has(`${action}:${entityId}`)
                          ? { id: 'a1' }
                          : null,
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
            insert: async (row: Record<string, unknown>) => {
              audits.push(row);
              if (row.action === PAYMENT_DOCUMENT_MISSING_ALERT_SENT) {
                existingSent.add(`${row.action}:${row.entity_id}`);
              }
              return { error: null };
            },
          };
        }
        if (table === 'tenants') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { name: 'Studio', from_email: null },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'offerings') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        }
        return {};
      },
    } as never;

    const result = await runCheckMissingDocuments(service);

    expect(result.missingScanned).toBe(1);
    expect(result.missingAlerted).toBe(1);
    expect(sendHtmlEmail).toHaveBeenCalled();
    expect(audits.some((a) => a.action === PAYMENT_DOCUMENT_MISSING_ALERT_SENT)).toBe(true);
  });

  it('retries admin invoice email when document exists but sent audit missing', async () => {
    const audits: Record<string, unknown>[] = [];
    let paymentSelectRound = 0;

    const service = {
      from: (table: string) => {
        if (table === 'payments') {
          return {
            select: (cols: string) => {
              // First query in runCheckMissingDocuments is missing docs; second is documented.
              // sendPaymentDocumentAdminEmail also selects payment by id.
              if (cols.includes('external_document_id') && cols.includes('invoice_url')) {
                return {
                  eq: () => ({
                    eq: () => ({
                      maybeSingle: async () => ({
                        data: {
                          id: PAYMENT_DOCUMENTED,
                          tenant_id: TENANT_ID,
                          total_amount_minor: 24000,
                          currency: 'ILS',
                          external_document_id: 'DOC-1',
                          external_document_number: '1001',
                          invoice_url: 'https://example.test/doc.pdf',
                          document_pdf_path: null,
                          engagement_id: 'eng-1',
                          offering_id: null,
                          paid_at: '2026-07-01T00:00:00Z',
                          provider: 'grow',
                        },
                        error: null,
                      }),
                    }),
                  }),
                };
              }
              paymentSelectRound += 1;
              if (paymentSelectRound === 1) {
                return {
                  eq: () => ({
                    is: () => ({
                      lt: () => ({
                        order: () => ({
                          limit: async () => ({ data: [], error: null }),
                        }),
                      }),
                    }),
                  }),
                };
              }
              return {
                eq: () => ({
                  not: () => ({
                    order: () => ({
                      limit: async () => ({
                        data: [{ id: PAYMENT_DOCUMENTED, tenant_id: TENANT_ID }],
                        error: null,
                      }),
                    }),
                  }),
                }),
              };
            },
          };
        }
        if (table === 'audit_log') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
            }),
            insert: async (row: Record<string, unknown>) => {
              audits.push(row);
              return { error: null };
            },
          };
        }
        if (table === 'tenants') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { name: 'Studio', from_email: null },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'offerings') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        }
        return {};
      },
    } as never;

    const result = await runCheckMissingDocuments(service);

    expect(result.adminEmailRetried).toBe(1);
    expect(result.adminEmailSent).toBe(1);
    expect(audits.some((a) => a.action === PAYMENT_DOCUMENT_ADMIN_EMAIL_SENT)).toBe(true);
    expect(sendHtmlEmail).toHaveBeenCalled();
  });
});
