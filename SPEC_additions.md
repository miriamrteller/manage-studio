| # | Issue | Severity | Schema change needed? |
|---|-------|----------|----------------------|
| 1 | user_profiles defined after tables that reference it | 🔴 Critical | Yes — reorder migration |
| 2 | Invoice sequence year-boundary bug | 🔴 Critical | Yes — add current_year or remove year prefix |
| 3 | No RLS bypass for super_admin | 🔴 Critical | Yes — add SECURITY DEFINER bypass |
| 4 | family_members missing tenant_id; 10+ tables missing RLS policies | 🔴 Critical | Yes — add column + write all missing policies |
| 5 | payments nullable on both family_id and person_id | 🔴 Critical | Yes — add CHECK constraint |
| 6 | Unique constraint blocks legitimate re-enrolment | 🟡 Significant | No — logic change only |
| 7 | WhatsApp template SIDs hardcoded; breaks multi-tenant | 🟡 Significant | Yes — add tenant_notification_templates table |
| 8 | Subscription vs. payment intent ambiguity in webhook | 🟡 Significant | No — architecture decision needed |
| 9 | Expense categories hardcoded in CHECK constraint | 🟡 Significant | Partial — add expense_categories table |
| 10 | No notification retry/queue mechanism | 🟡 Significant | Yes — add notification_queue table |
| 11 | ai_log table referenced but never defined | 🟠 Worth knowing | Yes — add migration |
| 12 | VAT rounding strategy undefined | 🟠 Worth knowing | No — code-level decision |
| 13 | is_minor stored boolean never revalidated | 🟠 Worth knowing | Yes — convert to computed |
| 14 | decryptVault() doesn't match Supabase Vault API | 🟠 Worth knowing | No — implementation fix |
| 15 | waiting_list.position requires manual management | 🟠 Worth knowing | Partial — add trigger or change to timestamp ordering |