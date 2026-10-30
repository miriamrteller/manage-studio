/**
 * Signed-contract emails: both parties, in the tenant's language, with the
 * PDF attached when the transport allows and a download link always; and at
 * most once per shoot however many times accept-waiver runs.
 */
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@^1";
import type { JobContractContext } from "../job-contract.ts";
import type { sendHtmlEmail } from "../email-client.ts";
import {
  type ContractEmailStorage,
  findExistingWaiverEvidence,
  notifyJobContractSigned,
  recordContractPdfFailure,
} from "./job-contract-signing.ts";
import { PDF_DEFERRED_SENTINEL, PDF_SHA256_NONE } from "./evidence.ts";

Deno.env.set("PLATFORM_EMAIL_DOMAIN", "opalswift.com");
Deno.env.set("APP_ROOT_DOMAIN", "opalswift.com");

const ENGAGEMENT = "22222222-2222-4222-8222-222222222222";

const tenant = {
  id: "t1",
  name: "סטודיו אור",
  language_default: "he",
  primary_color: "#123456",
  accent_color: "#654321",
  subdomain: "or",
  contact_email: "studio@example.com",
  from_email: null,
  from_email_verified_at: null,
};

const job: JobContractContext = {
  engagementId: ENGAGEMENT,
  personId: "p1",
  accountId: null,
  offeringId: "o1",
  engagementStatus: "active",
  waiverEvidenceId: "ev1",
  jobStatus: "booked",
  clientEmail: "dana@example.com",
  fields: { client_name: "דנה כהן", shoot_date: "24 בנובמבר 2026", location: "תל אביב", package: "חבילת משפחה", price: "₪1,250" },
};

const evidence = {
  id: "ev1",
  storagePath: "contracts/t1/e1/ev1.pdf",
  pdfSha256: "b".repeat(64),
  signedAt: "2026-10-30T10:15:42.000Z",
  typedName: "דנה כהן",
  signedByEmail: "Dana@Example.com",
};

/** In-memory automatic_email_log: one claim per (key, engagement), like the unique index. */
function fakeClient(opts: { signedUrl?: string | null } = {}) {
  const log = new Map<string, { status: string }>();
  const rpcCalls: Array<[string, Record<string, unknown>]> = [];
  const storage: ContractEmailStorage = {
    from: () => ({
      createSignedUrl: () =>
        Promise.resolve(
          opts.signedUrl === null
            ? { data: null, error: { message: "storage down" } }
            : { data: { signedUrl: opts.signedUrl ?? "https://storage.example/signed.pdf?token=abc" }, error: null },
        ),
      download: () => Promise.resolve({ data: new Blob([new TextEncoder().encode("%PDF-stored")]), error: null }),
    }),
  };
  const client = {
    storage,
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push([fn, args]);
      if (fn === "claim_automatic_email") {
        const key = `${args.p_email_key}:${args.p_engagement_id}`;
        if (log.has(key)) return Promise.resolve({ data: null, error: null });
        log.set(key, { status: "pending" });
        return Promise.resolve({ data: `log-${key}`, error: null });
      }
      if (fn === "complete_automatic_email") {
        const id = String(args.p_log_id).replace(/^log-/, "");
        log.set(id, { status: String(args.p_status) });
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fn}` } });
    },
  };
  return { client, log, rpcCalls };
}

function fakeSend() {
  const sent: Array<Parameters<typeof sendHtmlEmail>[0]> = [];
  const send: typeof sendHtmlEmail = (options) => {
    sent.push(options);
    return Promise.resolve({ id: "msg-1", delivered: [options.to], queued: [], permanentBounces: [] });
  };
  return { send, sent };
}

Deno.test("emails the signer and the studio in the tenant language, PDF attached, link in the body", async () => {
  const { client, log } = fakeClient();
  const { send, sent } = fakeSend();
  const pdf = new TextEncoder().encode("%PDF-fresh");

  const result = await notifyJobContractSigned(client, { tenant, language: "he", job, evidence, pdfBytes: pdf }, {
    send,
    attachmentsSupported: () => true,
  });

  assertEquals(result.client, "sent");
  assertEquals(result.studio, "sent");
  assertEquals(sent.map((m) => m.to), ["dana@example.com", "studio@example.com"]);
  assertEquals(sent.map((m) => m.from), ["or@opalswift.com", "or@opalswift.com"]);
  assertEquals(sent.map((m) => m.replyTo), ["studio@example.com", "studio@example.com"]);
  // Hebrew subjects, the client's by name of the studio, the studio's by name of the client.
  assertMatch(sent[0].subject, /החוזה החתום שלך עם סטודיו אור/);
  assertMatch(sent[1].subject, /דנה כהן חתם\/ה על החוזה/);
  for (const m of sent) {
    assertEquals(m.attachments?.length, 1);
    assertEquals(m.attachments?.[0].filename, "signed-contract-ev1.pdf");
    assertEquals(m.attachments?.[0].content, pdf);
    assert(m.html.includes("https://storage.example/signed.pdf?token=abc"));
    assert(m.html.includes('dir="rtl"'));
    assert(!m.html.includes("{{MS_"));
  }
  assertEquals([...log.values()].map((l) => l.status), ["sent", "sent"]);
});

Deno.test("idempotent: a second run for the same shoot sends nothing more", async () => {
  const { client } = fakeClient();
  const { send, sent } = fakeSend();
  const pdf = new TextEncoder().encode("%PDF-fresh");
  const deps = { send, attachmentsSupported: () => true };

  await notifyJobContractSigned(client, { tenant, language: "he", job, evidence, pdfBytes: pdf }, deps);
  const again = await notifyJobContractSigned(client, { tenant, language: "he", job, evidence, pdfBytes: null }, deps);

  assertEquals(sent.length, 2);
  assertEquals(again.client, "skipped");
  assertEquals(again.studio, "skipped");
});

Deno.test("a failed send is retried on the next attempt, still never duplicated once sent", async () => {
  const { client, log } = fakeClient();
  let fail = true;
  const { send, sent } = fakeSend();
  const flaky: typeof sendHtmlEmail = (options) => {
    if (fail) return Promise.reject(new Error("smtp down"));
    return send(options);
  };
  const deps = { send: flaky, attachmentsSupported: () => false };

  const first = await notifyJobContractSigned(client, { tenant, language: "en", job, evidence, pdfBytes: null }, deps);
  assertEquals([first.client, first.studio], ["failed", "failed"]);
  assertEquals([...log.values()].map((l) => l.status), ["failed", "failed"]);

  fail = false;
  // Claim for a failed row re-opens it (mirrors claim_automatic_email's retry branch).
  for (const [k, v] of log) if (v.status === "failed") log.delete(k);
  const second = await notifyJobContractSigned(client, { tenant, language: "en", job, evidence, pdfBytes: null }, deps);
  assertEquals([second.client, second.studio], ["sent", "sent"]);
  assertEquals(sent.length, 2);
});

Deno.test("without attachment support: no attachment, the signed link carries the PDF; replay attaches the stored bytes", async () => {
  const { client } = fakeClient();
  const { send, sent } = fakeSend();

  await notifyJobContractSigned(client, { tenant, language: "en", job, evidence, pdfBytes: null }, { send, attachmentsSupported: () => false });
  assertEquals(sent[0].attachments, undefined);
  assert(sent[0].html.includes("https://storage.example/signed.pdf?token=abc"));

  const replay = fakeClient();
  const replaySend = fakeSend();
  await notifyJobContractSigned(replay.client, { tenant, language: "en", job, evidence, pdfBytes: null }, {
    send: replaySend.send,
    attachmentsSupported: () => true,
  });
  assertEquals(new TextDecoder().decode(replaySend.sent[0].attachments![0].content), "%PDF-stored");
});

Deno.test("when storage cannot sign a URL the emails still go out, linking to the app", async () => {
  const { client } = fakeClient({ signedUrl: null });
  const { send, sent } = fakeSend();
  const result = await notifyJobContractSigned(client, { tenant, language: "en", job, evidence, pdfBytes: null }, { send, attachmentsSupported: () => false });
  assertEquals(result.downloadUrl, null);
  assert(sent[0].html.includes("https://or.opalswift.com/dashboard/portal"));
  assert(sent[1].html.includes(`https://or.opalswift.com/admin/jobs/${ENGAGEMENT}`));
});

Deno.test("no client email → only the studio is emailed; a transport failure never throws", async () => {
  const { client } = fakeClient();
  const { send, sent } = fakeSend();
  const result = await notifyJobContractSigned(
    client,
    { tenant, language: "en", job: { ...job, clientEmail: null }, evidence: { ...evidence, signedByEmail: null }, pdfBytes: null },
    { send, attachmentsSupported: () => false },
  );
  assertEquals(result.client, "no_recipient");
  assertEquals(result.studio, "sent");
  assertEquals(sent.length, 1);
});

Deno.test("findExistingWaiverEvidence looks the row up by tenant + idempotency key", async () => {
  const filters: unknown[] = [];
  const row = { id: "ev1", pdf_storage_path: "p", pdf_sha256: "h", signed_at: "s", signed_by_name: "n", signed_by_email: null };
  const client = {
    from: (table: string) => ({
      select: (cols: string) => ({
        eq: (c1: string, v1: string) => ({
          eq: (c2: string, v2: string) => ({
            maybeSingle: () => {
              filters.push([table, cols, c1, v1, c2, v2]);
              return Promise.resolve({ data: row, error: null });
            },
          }),
        }),
      }),
    }),
  };
  assertEquals(await findExistingWaiverEvidence(client, "t1", "idem-1"), row);
  assertEquals(filters, [["waiver_evidence", "id, pdf_storage_path, pdf_sha256, signed_at, signed_by_name, signed_by_email", "tenant_id", "t1", "idempotency_key", "idem-1"]]);
});

Deno.test("PDF failed at signing: emails still go out with app links and no attachment", async () => {
  const { client } = fakeClient();
  const { send, sent } = fakeSend();
  const sentinel = { ...evidence, storagePath: PDF_DEFERRED_SENTINEL, pdfSha256: PDF_SHA256_NONE };
  const result = await notifyJobContractSigned(client, { tenant, language: "en", job, evidence: sentinel, pdfBytes: null }, {
    send,
    attachmentsSupported: () => true,
  });
  assertEquals([result.client, result.studio], ["sent", "sent"]);
  assertEquals(result.downloadUrl, null);
  assertEquals(sent[0].attachments, undefined);
  assert(sent[0].html.includes("https://or.opalswift.com/dashboard/portal"));
  assert(sent[1].html.includes(`https://or.opalswift.com/admin/jobs/${ENGAGEMENT}`));
});

Deno.test("recordContractPdfFailure: audit row with the reason + contract_pdf_pending on the shoot; never throws", async () => {
  const inserts: Array<[string, Record<string, unknown>]> = [];
  const updates: Array<[string, Record<string, unknown>, unknown[]]> = [];
  const client = {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push([table, row]);
        return Promise.resolve({ error: null });
      },
      update: (patch: Record<string, unknown>) => {
        const filters: unknown[] = [];
        const q = {
          eq: (c: string, v: string) => {
            filters.push([c, v]);
            return q;
          },
          then: (resolve: (v: unknown) => void) => {
            updates.push([table, patch, filters]);
            resolve({ error: null });
          },
        };
        return q;
      },
    }),
  };
  await recordContractPdfFailure(client, { tenantId: "t1", engagementId: ENGAGEMENT, evidenceId: "ev1", reason: "bucket offline" });
  assertEquals(inserts.length, 1);
  assertEquals(inserts[0][0], "audit_log");
  assertEquals(inserts[0][1].action, "job_contract_pdf_failed");
  assertEquals(inserts[0][1].entity_id, "ev1");
  assertEquals((inserts[0][1].after_state as Record<string, unknown>).reason, "bucket offline");
  assertEquals(updates.length, 1);
  assertEquals(updates[0][0], "job_details");
  assertEquals(updates[0][1].contract_pdf_pending, true);
  assertEquals(updates[0][2], [["engagement_id", ENGAGEMENT], ["tenant_id", "t1"]]);

  // A failing client must not turn a recorded signing into an error.
  const broken = { from: () => ({ insert: () => Promise.reject(new Error("db down")), update: () => ({ eq: () => ({ eq: () => Promise.reject(new Error("db down")) }) }) }) };
  await recordContractPdfFailure(broken, { tenantId: "t1", engagementId: ENGAGEMENT, evidenceId: "ev1", reason: "x" });
});
