# Stage U0-live — QA spike + ADR sign-off

**Prerequisite:** Mock milestone (U1, U2a, U3, U4-mock). QA account + clearing terminal ready.

**Goal:** Capture real request/response shapes; close SPIKE-ADR open questions. Minimal code (fixtures only).

---

## Ops checklist

- [ ] Registered at private QA
- [ ] API key works (`IsAuthenticated`)
- [ ] Clearing terminal attached (Meshulam or UPAY) — note `CreditCardCompanyType`
- [ ] Tokenization enabled (else 309)
- [ ] Public HTTPS callback URL reachable (tunnel OK for spike)

---

## Probe matrix (Postman or curl)

1. Hosted charge + `IsDocCreate` + `AddTokenAndCharge` → redirect → pay with QA test card → save raw callback body  
2. `ChargeWithToken` for same `CustomerId` + `IsDocCreate` → save response  
3. `Refund` with `PaymentId` → save response (credit fields?)  
4. Confirm PDF/cipher link construction  

Store redacted fixtures under `supabase/functions/_shared/payments/invoice4u/fixtures/`.

---

## ADR exit criteria

Update [SPIKE-ADR.md](SPIKE-ADR.md):

- [ ] Callback parse rules finalized  
- [ ] Renewal sync vs webhook decision  
- [ ] Refund credit strategy finalized  
- [ ] Webhook verification approach chosen  

**Stop.** Hand off to U2b. No production tenant flip.
