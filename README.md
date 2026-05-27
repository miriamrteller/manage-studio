# Ballet School Management System (BSMS)

A robust, multi-tenant management platform designed specifically for dance schools and community centers. Built with a focus on reliability, legal compliance (Israeli market), and seamless AI integration.

## 🚀 Overview

This system streamlines the complex operations of running a ballet school—from student enrollment and automated scheduling to financial management and parent communications. It is architected as a **multi-tenant SaaS**, allowing each school to operate in a fully isolated environment with its own branding, legal configurations, and API keys.

## 🌟 Key Features

### 🩰 Core School Management
- **Unified Person Model:** Manages children, teens, and adult students within a single framework.
- **Dynamic Enrollment:** A 4-step wizard with built-in automated requirement checks (age, prerequisites, admin approval).
- **Attendance & Makeups:** Digital registers for teachers and automated makeup credit generation for students.
- **Terms & Scheduling:** Support for recurring classes, one-off workshops, and multi-studio room management.

### 💰 Finance & Legal (Israeli Market Optimized)
- **Stripe Integration:** Secure payments via Stripe Elements and automated subscription handling.
- **Legal Compliance:** Sequential, gapless invoice numbering and Israeli VAT-compliant calculations (Banker's rounding).
- **Expense Tracking:** Integrated P&L management with tenant-defined expense categories.
- **Pass-through Billing:** Schools use their own Stripe, Twilio, and Resend keys—eliminating platform margin risk.

### 📱 Communication & Portals
- **Omnichannel Notifications:** Integrated Email, WhatsApp Business API (Twilio), and Voice notifications.
- **Parent/Student Portals:** Magic-link authenticated dashboards for families to manage enrollments and payments.
- **RTL & I18n:** Built from the ground up for Hebrew (RTL) with secondary English support.

### 🤖 AI-Enhanced Operations (Modular)
- **Enrolment Q&A:** Context-aware chatbot (Claude) to answer parent queries without accessing PII.
- **Voice Chatbot (V2):** Automated phone handling for schedule and pricing inquiries.
- **Smart Drafting:** AI-assisted communication drafting for school announcements.

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS (RTL) |
| **State/Forms** | TanStack Query v5, React Hook Form, Zod |
| **UI Components** | shadcn/ui (Radix Primitives) |
| **Backend** | Supabase (Postgres, Auth, RLS, Edge Functions) |
| **Payments** | Stripe |
| **Communications** | Twilio (WhatsApp/Voice), Resend (Email) |
| **AI** | Anthropic Claude API |

## 🏗️ Architecture

- **Row-Level Security (RLS):** Strict multi-tenant isolation enforced at the database level. Every row is tied to a `tenant_id`.
- **Edge Functions:** Business logic (Stripe, Twilio) resides in Supabase Edge Functions for security and scalability.
- **Reliability First:** AI features are decoupled modules; the core CRUD system remains fully functional if AI services are offline.
- **Audit Logging:** Comprehensive immutable logs for every sensitive action (payments, data access, enrollment).

## 📊 Roadmap

- **V1:** Core CRUD, Enrollment, Payments, WhatsApp Notifications, and Expense Tracking.
- **V2:** Attendance automation, Waiting list logic, and Voice-bot integration.
- **V3:** Full SaaS onboarding and white-labeling capabilities.

## 🔐 Auth & email setup

Magic-link login uses **Supabase Auth email delivery** (not the Resend Edge Functions). If dashboard "Send magic link" fails with `Error sending magic link email`, configure custom SMTP.

| Task | Doc / command |
| --- | --- |
| Full auth + email runbook | [docs/deployment/AUTH_EMAIL_SETUP.md](docs/deployment/AUTH_EMAIL_SETUP.md) |
| Diagnose hosted magic-link send | `pnpm auth:check-email` (needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) |
| Seed parent test user (hosted) | `pnpm seed:auth-parent` |
| Local dev emails (Inbucket) | `pnpm db:reset-local` then open http://127.0.0.1:54324 |
| Third-party services | [docs/deployment/THIRD_PARTY_SERVICES.md](docs/deployment/THIRD_PARTY_SERVICES.md) |
| Operations runbook | [docs/MANUAL_OPERATIONS_RUNBOOK.md](docs/MANUAL_OPERATIONS_RUNBOOK.md) |

---
*Built for reliability. Designed for dance.*
