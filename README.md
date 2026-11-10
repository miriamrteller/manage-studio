# OpalSwift

OpalSwift is a studio-management app for small businesses that teach classes or work with clients: dance and art studios, tutors, coaches, photographers and more. Studios use it for leads, students and families, classes and seasons, shoots and quotes, bookings, payments, forms to sign and messages. Everything works in Hebrew and English.

**New here? Start with [docs/CODE-MAP.md](docs/CODE-MAP.md).** It explains where everything lives and what the code words mean.

## What's in the repo

| Folder | What it is |
| --- | --- |
| `apps/web/` | The app (React). |
| `apps/marketing/` | The marketing site (plain HTML). |
| `supabase/` | The database (migrations), server functions and database tests. |
| `packages/shared/` | Code used by both the app and the server, including email templates. |
| `workers/lead-email-ingest/` | Turns emailed enquiries into leads. |
| `docs/` | Plans, legal texts and how-to guides. |
| `scripts/` | Helper tools for developers. |

## Rules

Product and pipeline rules are in [CLAUDE.md](CLAUDE.md). Legal wording changes go on [docs/legal/AWAITING-LAWYER-REVIEW.md](docs/legal/AWAITING-LAWYER-REVIEW.md).

## Useful guides

| Task | Where |
| --- | --- |
| How dev and live releases work | [docs/deployment/DEV-PROD-PIPELINE.md](docs/deployment/DEV-PROD-PIPELINE.md) |
| Shared secrets and how to change them | [docs/deployment/SHARED-SECRETS.md](docs/deployment/SHARED-SECRETS.md) |
| One-off fixes to live data | [docs/deployment/PROD-TASKS.md](docs/deployment/PROD-TASKS.md) |
| Day-to-day operations | [docs/deployment/MANUAL_OPERATIONS_RUNBOOK.md](docs/deployment/MANUAL_OPERATIONS_RUNBOOK.md) |
| Log-in and email setup | [docs/deployment/AUTH_EMAIL_SETUP.md](docs/deployment/AUTH_EMAIL_SETUP.md) |
| Outside services we use | [docs/deployment/THIRD_PARTY_SERVICES.md](docs/deployment/THIRD_PARTY_SERVICES.md) |
| Look and feel rules | [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) |
| Current plans | [docs/plans/README.md](docs/plans/README.md) |

## Commands

| Task | Command |
| --- | --- |
| Run the app locally | `pnpm dev` |
| Build, lint, test everything | `pnpm build`, `pnpm lint`, `pnpm test` |
| Reset the local database with demo data | `pnpm db:reset-local` (emails appear at http://127.0.0.1:54324) |
| Rebuild the database types | `pnpm db:types` |
| Preview an email template | `pnpm email:preview magic_link` |

`SPEC.md` is the first plan and is kept for history. It is not today's guide.
