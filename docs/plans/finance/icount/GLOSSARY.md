# iCount integration — glossary

Use these terms consistently in code, docs, and agent prompts. **Do not mix synonyms in identifiers.**

| Term | Meaning | Code / DB |
|------|---------|-----------|
| **`cp`** | CC page id (hosted checkout page) — official iCount query param and IPN field | `payment_provider_public_key`; URL path `/m/{cp}` |
| **`page_id`** | Prose alias for **`cp`** only — never a separate column or param name | Comments / docs OK; code uses `cp` or `pageId` in camelCase builders |
| **`cid`** | iCount company id | `payment_provider_account_id` |
| **API token** | Settings → API bearer token | `payment_provider_secret_enc` via `save_tenant_icount_credentials` |
| **Bundled** | `payment_provider === invoicing_provider === 'icount'` | Atomic credential RPC |
| **IPN** | CC page instant payment notification POST | `handle-payment-event` |
| **Document webhook** | JSON array POST with `pdf_link`, `cc_payments[]` | `handle-invoice-event` |
| **API v3** | REST modules at `POST /api/v3.php/{module}/{method}` | Bearer token; form-encoded body |
| **apiv3 docs** | Interactive catalog | [apiv3.icount.co.il](https://apiv3.icount.co.il/) — see [API-V3-REFERENCE.md](API-V3-REFERENCE.md) |

**Redirect template (official):**

```
https://app.icount.co.il/m/{cp}?cs=…&cd=…&ipn_url=…&m__tenant_id=…
```

See [SPIKE-ADR.md](SPIKE-ADR.md) § Hosted checkout (#2).
