/**
 * Daily lead follow-up digest (docs/plans/LEADS.md, step 4). Pure: which leads
 * are due and the email text. Used by run-lead-followup-digest; tested from
 * apps/web.
 */

export type DigestLang = "en" | "he";

export interface DigestLead {
  id: string;
  name: string;
  stage: string;
  next_follow_up_at: string | null;
  converted_account_id: string | null;
  phone: string | null;
  email: string | null;
}

/** Leads to follow up today: a follow-up date today or earlier, still open (not won, lost or converted). */
export function dueLeads<T extends DigestLead>(leads: T[], today: string): T[] {
  return leads
    .filter(
      (l) =>
        l.next_follow_up_at !== null &&
        l.next_follow_up_at.slice(0, 10) <= today &&
        l.converted_account_id === null &&
        l.stage !== "won" &&
        l.stage !== "lost",
    )
    .sort((a, b) => (a.next_follow_up_at ?? "").localeCompare(b.next_follow_up_at ?? ""));
}

const STAGES: Record<DigestLang, Record<string, string>> = {
  en: {
    new: "New",
    contacted: "Contacted",
    qualified: "Qualified",
    proposal: "Proposal",
    trial_booked: "Trial booked",
    trial_done: "Trial done",
  },
  he: {
    new: "חדש",
    contacted: "נוצר קשר",
    qualified: "מתאים",
    proposal: "הצעה",
    trial_booked: "נקבע שיעור ניסיון",
    trial_done: "היה שיעור ניסיון",
  },
};

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** One email per studio admin: the leads to follow up today (overdue first). */
export function digestEmail(input: {
  studio: string;
  leads: DigestLead[];
  today: string;
  leadsUrl: string;
  settingsUrl: string;
  lang: DigestLang;
}): { subject: string; html: string; text: string } {
  const { studio, leads, today, leadsUrl, settingsUrl, lang } = input;
  const he = lang === "he";
  const n = leads.length;
  const subject = he
    ? `${n === 1 ? "ליד אחד" : `${n} לידים`} למעקב היום – ${studio}`
    : `${n} ${n === 1 ? "lead" : "leads"} to follow up today – ${studio}`;
  const intro = he ? "הלידים האלה מחכים לכם היום:" : "These leads are waiting for you today:";
  const overdue = he ? "באיחור" : "overdue";
  const open = he ? "פתיחת עמוד הלידים" : "Open your leads";
  const footer = he
    ? "קיבלתם את המייל כי אתם מנהלי הסטודיו. אפשר לכבות אותו בהגדרות."
    : "You get this email because you manage this studio. You can turn it off in Settings.";
  const settings = he ? "הגדרות" : "Settings";

  const rows = leads.map((l) => {
    const date = (l.next_follow_up_at ?? "").slice(0, 10);
    const late = date < today;
    const stage = STAGES[lang][l.stage] ?? l.stage;
    const contact = [l.phone, l.email].filter(Boolean).join(" · ");
    return { name: l.name, stage, contact, late };
  });

  const html =
    `<!doctype html><html lang="${lang}" dir="${he ? "rtl" : "ltr"}"><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111827;max-width:560px;margin:0 auto;padding:16px">` +
    `<p>${esc(intro)}</p><table cellpadding="6" style="border-collapse:collapse;width:100%">` +
    rows
      .map(
        (r) =>
          `<tr style="border-top:1px solid #E5E7EB"><td><b>${esc(r.name)}</b>${r.late ? ` <span style="color:#B91C1C">(${overdue})</span>` : ""}<br>` +
          `<span style="color:#4B5563;font-size:13px">${esc(r.stage)}${r.contact ? ` · <span dir="ltr">${esc(r.contact)}</span>` : ""}</span></td></tr>`,
      )
      .join("") +
    `</table><p><a href="${esc(leadsUrl)}" style="display:inline-block;background:#4A58E8;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${esc(open)}</a></p>` +
    `<p style="font-size:12px;color:#6B7280">${esc(footer)} <a href="${esc(settingsUrl)}">${esc(settings)}</a></p></body></html>`;

  const text =
    `${intro}\n\n` +
    rows.map((r) => `- ${r.name}${r.late ? ` (${overdue})` : ""}: ${r.stage}${r.contact ? ` · ${r.contact}` : ""}`).join("\n") +
    `\n\n${open}: ${leadsUrl}\n\n${footer} ${settingsUrl}\n`;
  return { subject, html, text };
}
