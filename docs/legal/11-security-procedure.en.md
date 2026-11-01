> **Draft, not legal advice. Have an Israeli lawyer (and ideally a security consultant) review before relying on it.**
> Hebrew version: [11-security-procedure.he.md](11-security-procedure.he.md).
> Internal document. A short public summary may be shared with studios on request.

# OpalSwift Information Security Procedure (נוהל אבטחת מידע)

Version [[1.0]] · Approved by: [[OWNER NAME]], [[DATE]] · Next review: [[DATE + 12 months]]

## 1. Scope and security level

- **Systems:** the OpalSwift web app (`apps/web`, hosted on Cloudflare Workers), Supabase project(s) (Postgres database, Auth, Storage, Edge Functions; region eu-central-1 Frankfurt), Cloudflare (email sending, R2 backup bucket), GitHub (code, CI, backup job), Sentry (error monitoring, EU region), and optional integrations (Twilio, Google Calendar, payment and invoicing providers).
- **Databases:** OpalSwift is the **holder** (מחזיק) of each studio's database and the **controller** of its own account database (studio admins).
- **Security level: medium (רמת אבטחה בינונית).** Reason: studio databases include health information (health declarations, medical notes, allergies), which is in the list of data that puts a database at medium level under the Data Security Regulations. The database is not at **high** level today because it holds data on far fewer than 100,000 people and has far fewer than 100 authorised users. **Re-check the level if either number approaches those thresholds** (regulation 1 and the First Schedule; [[LAWYER: confirm]]). The account database (studio admins only, no sensitive data) would on its own be at basic level; we apply medium-level controls to everything.
- **Production vs. development:** a separate Supabase project for production. Development uses seed/fake data only.

## 2. Roles

| Role | Who | Responsibility |
|---|---|---|
| Owner / security lead | [[OWNER NAME]] | Approves this procedure, holds admin access, decides on incidents, keeps the backup decryption key |
| Developers / contractors | [[NAMES or "none"]] | Work through pull requests; no production data access unless approved under §4 |
| AI coding agents | Claude Code sessions and similar | See §4.4 |
| Studio admins | Each studio | Manage their own users and data inside their tenant |

A data security officer (ממונה על אבטחת מידע) is not legally required today ([[LAWYER: confirm under §17B and Amendment 13]]); the owner performs the role.

## 3. Asset and system map (kept up to date)

| Asset | Contents | Location |
|---|---|---|
| Postgres database | All studio and account data | Supabase, Frankfurt |
| Storage buckets | `waiver-pdfs` (signed waivers and job contracts) and `expense-receipts` (private); `offering-images`, `tenant-assets` (public — logos, class covers only, never personal data) | Supabase Storage |
| Edge Functions | Server logic (payments, signing, emails, cron jobs) | Supabase |
| Edge secrets | API keys, `CRON_SECRET`, `WAIVER_HMAC_KEY_V<n>`, Cloudflare/Twilio/Google credentials | Supabase secrets (not in git) |
| Backups | GPG-encrypted nightly and monthly `pg_dump` | Cloudflare R2 bucket `manage-studio-db-backups` (private) |
| Source code | No production personal data | GitHub `miriamrteller/manage-studio` |
| Admin accounts | Supabase, Cloudflare, GitHub, Google Cloud, Twilio, domain registrar, password manager | — |

## 4. Access control

### 4.1 In the application
- **Tenant isolation:** every tenant table has Row-Level Security; policies check `tenant_id = get_my_tenant_id()` and the user's role. A cross-tenant leak test suite (`scripts/verify-rls.mjs`, 37 checks) runs nightly and on database changes (`.github/workflows/rls-check.yml`, advisory).
- **Least-privilege functions:** sensitive writes go through `SECURITY DEFINER` functions with a fixed `search_path`, `REVOKE ALL … FROM PUBLIC`, and grants only to the role that needs them (e.g. `sign_waiver()` is service-role only).
- **Column-level protection:** encrypted credential columns (`*_enc`) are not readable by clients; table `SELECT` is revoked and re-granted per column.
- **Roles:** super admin (platform), tenant admin, staff/teacher, parent/student. Studio admins invite and remove their own users.
- **Health data:** visible only to studio admins and assigned teachers ([[VERIFY in RLS/UI]]).

### 4.2 Admin and provider accounts
- Only the owner has admin access to production Supabase, Cloudflare, GitHub, Google Cloud and Twilio.
- **Multi-factor authentication is required** on all of them and on the password manager. ([[OWNER: confirm enabled — action item]])
- Unique passwords in the password manager; no shared logins.
- Access for any other person is granted individually, least-privilege, time-limited, and revoked when work ends. Keep a list: who, what, from/to.

### 4.3 Sign-in for app users
- Email one-time codes / magic links via Supabase Auth (PKCE flow); optional SMS/WhatsApp codes via Twilio Verify for waiver signing.
- App-level MFA for studio admins: available in Settings → Security (authenticator app); the admin area then asks for the code at sign-in. Turn it on for every admin ([[ACTION]]).

### 4.4 AI agents and automation
- AI coding agents work on the code through branches and pull requests that the owner reviews and merges. They must not commit secrets or real personal data.
- **AI agents get no access to production personal data.** Database tools connected to AI agents (e.g. Supabase MCP) must point to the **development** project only. Any exception needs the owner's explicit approval for a specific task, read-only where possible, and is recorded in the access list. ([[OWNER: confirm this matches current practice]])
- Production data must never be pasted into an AI chat or prompt. If an AI provider ever processes production data, it must be added to the sub-processor list first.
- CI jobs (GitHub Actions) get only the secrets they need (`SUPABASE_PROD_DB_URL` for backup, R2 keys).

## 5. Encryption and key handling

- **In transit:** HTTPS/TLS for the app, Supabase API and all provider APIs.
- **At rest:** provider disk encryption (Supabase, Cloudflare R2) per the providers' documentation ([[CHECK provider docs]]).
- **Provider credentials** of each studio (payment, invoicing, Google tokens, webhook secrets) are encrypted in the database with the platform key in `private.platform_config.encryption_key`, resolved only by `get_app_encryption_key()`. That function refuses the retired development key.
- **Waiver/contract seal:** each signed record carries an HMAC over its canonical fields using `WAIVER_HMAC_KEY_V<n>`, kept in Edge secrets, **not** in the database, so a database compromise cannot re-seal a changed record. Keys are versioned (`hmac_key_version`).
- **Per-tenant link secrets** sign guest links for signing/payment; generated automatically, never seen by a person.
- **Backup encryption:** public-key (GPG) encryption on the CI runner before upload. The private key is kept in the password manager **and** in [[SECOND OFFLINE LOCATION]]. *Lesson from 2026-08-17: the v1 private key was lost and that backup is unreadable — keep two independent copies and test restore.*
- **Rotation:** rotate a key immediately if it may be exposed; otherwise review yearly. Document each rotation (date, key version).
- No secret in git, client code or logs. Client code uses only the publishable Supabase key.

## 6. Backup and recovery

- Nightly at 01:00 UTC: `pg_dump` → GPG encrypt → private R2 bucket. Retention: 30 nightly, ~13 monthly copies (lifecycle rules).
- Supabase free tier has no point-in-time recovery; plan: move production to a paid plan before the first paying studio ([[ACTION]]).
- **Restore test:** at least every [[6]] months, restore the latest backup to a scratch project and check row counts and checksums; record the result. Procedure: `docs/deployment/BACKUP-RESTORE-RUNBOOK.md`.
- Storage files (PDFs) are [[NOT / ALSO]] in the nightly backup ([[VERIFY — if not, add]]).

## 7. Logging and monitoring

- `audit_log` table: tenant, actor, action, entity, before/after state, IP, browser, time — for sensitive actions (payments, refunds, quotes, consents, admin changes).
- `waiver_events` (append-only) and `waiver_evidence` (immutable — updates and deletes blocked by triggers).
- Provider logs: Supabase (API, auth, database), Cloudflare.
- **Retention:** the regulations require access logs to be kept for at least 24 months at medium level ([[LAWYER: confirm regulation 10]]). Supabase's own logs are kept for a short time on the current plan, so **the `audit_log` must cover access to sensitive records, or logs must be exported** ([[ACTION / GAP]]). Do not delete `audit_log` rows younger than 24 months.
- Review: the owner reviews audit and auth logs at least [[monthly]] for unusual activity, and after any alert. Missing tax-document and failed-cron alerts are emailed automatically.

## 8. Secure development

- All changes go through pull requests; CI runs lint, unit tests, build, edge-function checks and accessibility tests.
- Database changes are migrations in `supabase/migrations`; RLS is enabled on every new table; new functions follow §4.1.
- Dependencies come from the lockfile; review security advisories [[monthly]].
- Seed and test data are fictitious.

## 9. Devices and physical security

- Devices used for admin work: full-disk encryption, screen lock, up-to-date OS, no shared user accounts.
- No production data exports kept on local disks longer than needed; delete after use. Exports to a studio are sent by secure link, not as email attachments ([[ACTION]]).
- Servers are run by the cloud providers; their physical security is covered by their certifications.

## 10. People

- Anyone given access signs a confidentiality undertaking and reads this procedure. Training on this procedure for every new person and at least every **two years** (medium level) — the owner re-reads it every year.
- Access is removed the same day a person stops working on the Platform.

## 11. Sub-processors and outsourcing

- The list in the [DPA](02-dpa.en.md) §4 is kept current. Before adding a provider: check where data goes, its security, and its DPA / transfer undertaking (regulation 15; Transfer Abroad Regulations reg. 2(4)–3).

## 12. Security incidents

**What counts:** any event that may compromise the confidentiality, integrity or availability of personal data — e.g. leaked credentials, cross-tenant data exposure, lost device with data, ransomware, a provider breach, a backup that cannot be restored, or an email sent to the wrong recipients.

**Steps:**
1. **Contain** (minutes–hours): revoke/rotate keys, disable affected accounts or functions, block access.
2. **Record** in the incident log: time found, who found it, what happened, data and studios affected.
3. **Assess** whether it is a **severe security incident** — at medium level, use of a substantial part of the database without authorisation or beyond authorisation, or damage to the integrity of a substantial part (regulation 11).
4. **Notify studios** (controllers) without undue delay and within **[[24]] hours** (DPA §7).
5. **Notify the Privacy Protection Authority immediately** of a severe incident, and send a report on the steps taken. Coordinate with the affected studios; one report can cover controller and holder ([[LAWYER: confirm]]). Notify data subjects if the Authority orders it.
6. **Fix and review:** root cause, fix, and lessons learned; update this procedure.

All incidents (including minor ones) are reviewed together at least **once a year** (medium level).

## 13. Audit and review

- Internal or external audit of compliance with the Data Security Regulations at least every **24 months** (medium level) ([[ACTION: schedule]]).
- This procedure is reviewed at least yearly and after any significant change to systems or any severe incident.

## 14. Data deletion

- Studio leaves: export on request, then delete from the live database within 30 days; backups expire per §6 (see DPA §9).
- Individual deletion requests are handled by the studio (controller); OpalSwift helps if needed. Immutable signed records are kept until the studio's retention period ends ([[LAWYER: deletion vs. evidence retention]]).

## Known gaps (action list)

1. MFA on all admin/provider accounts — confirm. 2. App-level MFA for studio admins. 3. 24-month access-log retention. 4. Paid Supabase plan / PITR before first paying tenant. 5. Storage files in backups — verify. 6. Second offline copy of the backup key + restore test record. 7. Written access list and confidentiality undertakings. 8. Schedule first audit.

---

### Sources relied on
- Privacy Protection (Data Security) Regulations 5777-2017: reg. 1 and First Schedule (security levels); reg. 2 (database definition document); reg. 4 (security procedure); reg. 5 (system mapping); reg. 6 (physical security); reg. 7 (personnel, training); regs. 8–9 (access and identification); reg. 10 (logging); reg. 11 (incidents, severe incident reporting); reg. 12 (mobile devices); reg. 14 (network/remote access); reg. 15 (outsourcing); reg. 16 (periodic audits — every 24 months at medium/high level); reg. 17 (backup). *Regulation numbers and medium-level details are from memory and secondary sources; verify against the official text.*
- Privacy Protection Law 5741-1981 as amended by Amendment 13 (§17 holder's duty; §17B data security officer; §17B1 privacy protection officer).
- Privacy Protection Authority guidance on severe incident reporting ("immediately" after becoming aware), as summarised in Israeli law-firm publications.
- App facts: `supabase/migrations/20260608000200_core_tenants.sql`, `20260608000700_audit_security.sql`, `20260608001200_waiver_evidence.sql`, `20260608002700_grants.sql`; `.github/workflows/backup-prod.yml`, `rls-check.yml`; `docs/deployment/CREDENTIAL-OWNERSHIP.md`, `BACKUP-RESTORE-RUNBOOK.md`.
