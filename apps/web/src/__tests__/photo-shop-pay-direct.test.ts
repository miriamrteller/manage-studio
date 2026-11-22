/**
 * Photo shop: the ways the studio switches on to be paid directly (Bit, bank transfer, cash,
 * cheque), the order's payment page, payment screenshots and reminders (owner, 22 Nov 2026).
 * Only what the studio filled in is shown, as plain text. Run: pnpm -C apps/web test photo-shop-pay-direct
 */
import { describe, expect, it } from 'vitest';
import {
  asksForProof,
  cleanBitPhone,
  cleanDetails,
  payDirectFromSettings,
  payDirectHow,
  payDirectWaysText,
} from '../../../../supabase/functions/_shared/photo-shop/pay-direct.ts';
import {
  decodeProof,
  detectProofImageType,
  PROOF_MAX_BYTES,
  proofReminderDue,
} from '../../../../supabase/functions/_shared/photo-shop/payment-proof.ts';
import {
  buildClientPayDirectEmail,
  buildClientProofReminderEmail,
  buildStudioOrderEmail,
  buildStudioProofEmail,
} from '../../../../supabase/functions/_shared/photo-shop/email-copy.ts';
import { hasPayDirect, joinWithOr, payDirectWays, photoOrderPaymentPath } from '@/features/jobs/services/clientPhotoShopService';
import { bitPhoneInput } from '@/features/jobs/services/photoShopService';

const all = {
  accepts_bit: true, bit_phone: '050-0000000',
  accepts_bank: true, bank_details: 'Studio account\nBank 12, branch 345',
  accepts_cash: true, cash_instructions: 'Pay at the studio',
  accepts_cheque: true, cheque_instructions: null,
};

describe('cleaning what the studio typed', () => {
  it('keeps a phone, tidied; anything else is null', () => {
    expect(cleanBitPhone('  050-000  0000 ')).toBe('050-000 0000');
    for (const v of [null, '', '---', '<b>050</b>', '0'.repeat(40), 5]) expect(cleanBitPhone(v)).toBeNull();
  });
  it('keeps lines, drops empty ones and control characters, caps the length', () => {
    expect(cleanDetails('Studio account\r\n\r\nBank 12\u0007 branch 345  ')).toBe('Studio account\nBank 12 branch 345');
    expect(cleanDetails('x'.repeat(900))!.length).toBe(500);
    expect(cleanDetails('   \n ')).toBeNull();
  });
});

describe('payDirectFromSettings', () => {
  it('only the ways switched on; Bit needs a phone, bank needs details; cash / cheque need nothing', () => {
    expect(payDirectFromSettings(null)).toBeNull();
    expect(payDirectFromSettings({ accepts_bit: true, bit_phone: '', accepts_bank: true, bank_details: ' ' })).toBeNull();
    expect(payDirectFromSettings({ accepts_bit: false, bit_phone: '050-0000000', accepts_cheque: true })).toEqual({
      ways: [{ method: 'cheque', details: null }],
    });
    expect(payDirectFromSettings(all)!.ways.map((w) => w.method)).toEqual(['bit', 'bank', 'cash', 'cheque']);
  });
  it('a screenshot is asked for only with Bit or bank transfer on offer', () => {
    expect(asksForProof(payDirectFromSettings({ accepts_cash: true }))).toBe(false);
    expect(asksForProof(payDirectFromSettings(all))).toBe(true);
  });
});

describe('wording', () => {
  it('"by Bit, by bank transfer or in cash", EN and HE', () => {
    expect(payDirectHow('en', ['bit', 'bank', 'cash'])).toBe('by Bit, by bank transfer or in cash');
    expect(payDirectHow('he', ['bit', 'cheque'])).toBe("בביט או בצ'ק");
  });
  it('each way with its details for emails', () => {
    const text = payDirectWaysText('en', payDirectFromSettings(all));
    expect(text).toContain('• By Bit to 050-0000000');
    expect(text).toContain('• By bank transfer:\nStudio account\nBank 12, branch 345');
    expect(text).toContain('• In cash:\nPay at the studio');
    expect(text).toContain('• By cheque');
  });
});

describe('emails', () => {
  const base = {
    studioName: 'Studio', photoCount: 2, totalFormatted: '₪60',
    payUrl: 'https://s.test/dashboard/portal/photo-order/e1/o1',
    ways: '• By Bit to 050-0000000',
  };
  it('the client gets the ways and the payment page link', () => {
    const e = buildClientPayDirectEmail({ ...base, language: 'en', asksForProof: true });
    expect(e.body).toContain('• By Bit to 050-0000000');
    expect(e.body).toContain('send a screenshot of your payment there');
    expect(e.body).toContain(base.payUrl);
    const h = buildClientPayDirectEmail({ ...base, language: 'he', asksForProof: false, ways: '• במזומן' });
    expect(h.body).toContain('• במזומן');
    expect(h.body).not.toContain('צילום מסך');
  });
  it('the reminder links to the payment page', () => {
    const r = buildClientProofReminderEmail({ ...base, language: 'en', asksForProof: true });
    expect(r.body).toContain(base.payUrl);
  });
  it('the studio is told how the client may pay, and when a screenshot comes', () => {
    const e = buildStudioOrderEmail({
      language: 'en', clientName: 'Client', totalFormatted: '₪30', photos: [], shootUrl: 'https://s.test', payInCash: true,
      payHow: 'by Bit or in cash',
    });
    expect(e.subject).toContain('paying by Bit or in cash');
    const h = buildStudioProofEmail({
      language: 'he', clientName: 'Client', photoCount: 2, totalFormatted: '₪60', payHow: 'בהעברה בנקאית', shootUrl: 'https://s.test/admin/jobs/e1',
    });
    expect(h.body).toContain('בהעברה בנקאית');
    expect(h.body).toContain('https://s.test/admin/jobs/e1');
  });
});

describe('client side', () => {
  it('the ways, "a, b or c" and the payment page path', () => {
    expect(hasPayDirect({ pay_direct: null })).toBe(false);
    expect(payDirectWays({ pay_direct: { ways: [{ method: 'cash', details: null }] } })).toHaveLength(1);
    expect(joinWithOr(['by Bit', 'in cash', 'by cheque'], 'or')).toBe('by Bit, in cash or by cheque');
    expect(photoOrderPaymentPath('e1', 'o1')).toBe('/dashboard/portal/photo-order/e1/o1');
  });
  it('the Bit number box keeps only phone characters', () => {
    expect(bitPhoneInput('050-abc 000<0000>')).toBe('050- 0000000');
  });
});

describe('payment screenshot', () => {
  it('knows PNG, JPEG and WebP by their first bytes, nothing else', () => {
    expect(detectProofImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(detectProofImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(detectProofImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe('image/webp');
    expect(detectProofImageType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
  });
  it('decodes base64 and refuses junk or anything over 5 MB', () => {
    expect(Array.from(decodeProof('data:image/png;base64,iVBORw==')!)).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(decodeProof('not base64!')).toBeNull();
    expect(decodeProof('A'.repeat(Math.ceil(((PROOF_MAX_BYTES + 100) * 4) / 3)))).toBeNull();
  });
  it('reminders at 1, 3 and 7 days, then no more', () => {
    const created = '2026-11-20T10:00:00Z';
    const at = (iso: string) => new Date(iso);
    expect(proofReminderDue(created, 0, at('2026-11-21T09:00:00Z'))).toBe(false);
    expect(proofReminderDue(created, 0, at('2026-11-21T10:00:00Z'))).toBe(true);
    expect(proofReminderDue(created, 1, at('2026-11-22T10:00:00Z'))).toBe(false);
    expect(proofReminderDue(created, 1, at('2026-11-23T10:00:00Z'))).toBe(true);
    expect(proofReminderDue(created, 2, at('2026-11-27T10:00:00Z'))).toBe(true);
    expect(proofReminderDue(created, 3, at('2026-12-20T10:00:00Z'))).toBe(false);
  });
});
