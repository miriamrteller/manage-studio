import { handleOptions, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/edge-runtime/supabase.ts";
import { documentRouteFor, enqueueDocument } from "../_shared/enqueue-document.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import {
  type ImportedIncomeRow,
  importedPaymentRow,
  planImportedReceipt,
  type RowRefusal,
  SendImportedReceiptsSchema,
} from "../_shared/payments/imported-receipt.ts";

/**
 * Finance -> Import -> "Send receipt" (one row) or "Send receipts" (ticked rows).
 * Each imported income row becomes a payment recorded by hand, paid on the row's date, and the
 * studio's invoicing service issues the receipt and it is emailed to the payer (issue-document).
 * The payer is the client with that email, or a new client with the sheet's name and email.
 * Rows with a receipt number from the old system, or already sent, are never sent again.
 */

type RowResult = { income_id: string; ok: true; payment_id: string } | { income_id: string; ok: false; reason: RowRefusal | "failed" };

const ROW_COLUMNS =
  "id, tenant_id, income_date, amount_minor, payer_name, payer_email, payment_method, job_name, receipt_book, receipt_number, payment_id";

Deno.serve(withMonitoring("send-imported-receipts", async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireAuthUser(req);
  if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

  const parsed = SendImportedReceiptsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonResponse({ error: "Invalid request body" }, 400);

  const service = createServiceClient();
  const { data: profile } = await service
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("id", auth.user.id)
    .single();
  const roles = (profile?.role as string[] | null) ?? [];
  if (!profile?.tenant_id || !(roles.includes("tenant_admin") || roles.includes("super_admin"))) {
    return jsonResponse({ error: "tenant_admin role required" }, 403);
  }
  const tenantId = profile.tenant_id as string;

  const { data: tenant } = await service
    .from("tenants")
    .select("currency, invoicing_provider, green_invoice_document_type")
    .eq("id", tenantId)
    .single();
  // Only when the receipt can actually be issued: nothing is recorded otherwise.
  const route = documentRouteFor({
    invoicingProvider: tenant?.invoicing_provider as string | null | undefined,
    paymentProvider: "manual",
    documentKind: "sale",
    greenInvoiceDocumentType: tenant?.green_invoice_document_type as number | null | undefined,
  });
  if (route.route !== "queue") {
    return jsonResponse({ error: "receipts_unavailable", invoicing_provider: tenant?.invoicing_provider ?? null }, 409);
  }
  const currency = (tenant?.currency as string | null) ?? "ILS";

  const ids = parsed.data.rows.map((r) => r.income_id);
  const { data: rows, error: rowsError } = await service
    .from("imported_income")
    .select(ROW_COLUMNS)
    .eq("tenant_id", tenantId)
    .in("id", ids);
  if (rowsError) return jsonResponse({ error: "Could not load the rows" }, 500);
  const byId = new Map(((rows ?? []) as ImportedIncomeRow[]).map((r) => [r.id, r]));

  const results: RowResult[] = [];
  for (const request of parsed.data.rows) {
    const row = byId.get(request.income_id);
    const plan = planImportedReceipt(row, tenantId, { email: request.email, method: request.method });
    if (!plan.ok || !row) {
      results.push({ income_id: request.income_id, ok: false, reason: plan.ok ? "not_found" : plan.reason });
      continue;
    }
    try {
      results.push(await sendOne(service, { tenantId, actorUserId: auth.user.id, row, currency, ...plan }));
    } catch (err) {
      console.error("[send-imported-receipts] row failed", row.id, err);
      results.push({ income_id: row.id, ok: false, reason: "failed" });
    }
  }

  return jsonResponse({ results, sent: results.filter((r) => r.ok).length });
}));

async function sendOne(
  service: ReturnType<typeof createServiceClient>,
  params: {
    tenantId: string;
    actorUserId: string;
    row: ImportedIncomeRow;
    currency: string;
    email: string;
    name: string;
    method: "cash" | "bank_transfer" | "bit";
  },
): Promise<RowResult> {
  const { tenantId, row } = params;

  // The client with this email, or a new one with the sheet's name.
  const { data: existing } = await service
    .from("people")
    .select("id, account_id")
    .eq("tenant_id", tenantId)
    .ilike("email", params.email.replace(/[\\%_]/g, (c) => `\\${c}`))
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  let personId = (existing?.id as string | undefined) ?? null;
  let accountId = (existing?.account_id as string | null | undefined) ?? null;
  if (!personId) {
    const { data: created, error } = await service.rpc("job_resolve_client", {
      p_tenant_id: tenantId,
      p_person_id: null,
      p_name: params.name,
      p_email: params.email,
      p_phone: null,
    });
    const first = Array.isArray(created) ? created[0] : created;
    if (error || !first?.person_id) throw error ?? new Error("Could not add the client");
    personId = first.person_id as string;
    accountId = (first.account_id as string | null) ?? null;
    await service.from("audit_log").insert({
      tenant_id: tenantId,
      action: "CREATE",
      entity_type: "people",
      entity_id: personId,
      actor_id: params.actorUserId,
      after_state: { source: "send_imported_receipt", imported_income_id: row.id },
    });
  }

  const { data: payment, error: insertError } = await service
    .from("payments")
    .insert(importedPaymentRow({
      tenantId,
      personId,
      accountId,
      row,
      name: params.name,
      method: params.method,
      currency: params.currency,
      actorUserId: params.actorUserId,
    }))
    .select("id")
    .single();
  if (insertError || !payment) {
    // A second press for the same row: the unique ref already holds its payment.
    if (insertError?.code === "23505") return { income_id: row.id, ok: false, reason: "already_sent" };
    throw insertError ?? new Error("Insert failed");
  }
  const paymentId = payment.id as string;

  const { data: linked, error: linkError } = await service
    .from("imported_income")
    .update({ payment_id: paymentId, payer_email: params.email })
    .eq("id", row.id)
    .eq("tenant_id", tenantId)
    .is("payment_id", null)
    .select("id");
  if (linkError || !linked?.length) {
    // Never leave a payment the row doesn't point at: take it back out.
    await service.from("payments").delete().eq("id", paymentId);
    if (linkError) throw linkError;
    return { income_id: row.id, ok: false, reason: "already_sent" };
  }

  await service.from("audit_log").insert({
    tenant_id: tenantId,
    action: "manual_payment_recorded",
    entity_type: "payment",
    entity_id: paymentId,
    actor_id: params.actorUserId,
    after_state: {
      imported_income_id: row.id,
      person_id: personId,
      method: params.method,
      amount_minor: row.amount_minor,
      paid_on: row.income_date,
    },
  });

  await enqueueDocument(service, { tenantId, paymentId, documentKind: "sale" });
  return { income_id: row.id, ok: true, payment_id: paymentId };
}
