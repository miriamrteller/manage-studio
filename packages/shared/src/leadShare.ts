/**
 * Content for sharing a studio's enquiry form (docs/plans/LEADS.md, 2c).
 *
 * Used by the web app (Get leads panel) and by the send-lead-form-link Edge
 * Function (via the email-dist bundle), so the emails are built on the server
 * from fixed templates: an admin never sends free text through the platform.
 * Pure and dependency-free.
 */

export type ShareLang = 'en' | 'he';

export const WEBSITE_PLATFORMS = ['wix', 'wordpress', 'squarespace', 'google_sites'] as const;
export type WebsitePlatform = (typeof WEBSITE_PLATFORMS)[number];

export const WEBSITE_PLATFORM_NAMES: Record<WebsitePlatform, string> = {
  wix: 'Wix',
  wordpress: 'WordPress',
  squarespace: 'Squarespace',
  google_sites: 'Google Sites',
};

/** 3–4 steps per website builder for pasting the embed code. */
export const WEBSITE_STEPS: Record<ShareLang, Record<WebsitePlatform, string[]>> = {
  en: {
    wix: [
      'In the Wix editor, click Add Elements (+) → Embed Code → Embed HTML.',
      'Choose "Code" and paste the code.',
      'Drag the box larger so the whole form shows.',
      'Click Publish.',
    ],
    wordpress: ['Open the page in the editor.', 'Add a "Custom HTML" block.', 'Paste the code.', 'Click Update or Publish.'],
    squarespace: [
      'Edit the page and add a Code block (needs a plan that allows Code blocks).',
      'Paste the code; leave "Display source" off.',
      'Save, then publish the page.',
    ],
    google_sites: [
      'Open your site and click Insert → Embed.',
      'Choose "Embed code", paste the code, then Next → Insert.',
      'Drag the box larger so the whole form shows.',
      'Click Publish.',
    ],
  },
  he: {
    wix: [
      'בעורך של Wix לחצו על הוספת רכיבים (+) ← הטמעת קוד ← הטמעת HTML.',
      'בחרו "קוד" והדביקו את הקוד.',
      'הגדילו את התיבה כך שכל הטופס יופיע.',
      'לחצו על פרסום.',
    ],
    wordpress: ['פתחו את העמוד בעורך.', 'הוסיפו בלוק "HTML מותאם".', 'הדביקו את הקוד.', 'לחצו על עדכון או פרסום.'],
    squarespace: [
      'ערכו את העמוד והוסיפו בלוק Code (דורש מסלול שמאפשר בלוקי קוד).',
      'הדביקו את הקוד; השאירו את "Display source" כבוי.',
      'שמרו ופרסמו את העמוד.',
    ],
    google_sites: [
      'פתחו את האתר ולחצו על הוספה ← הטמעה.',
      'בחרו "הטמעת קוד", הדביקו את הקוד, ואז הבא ← הוספה.',
      'הגדילו את התיבה כך שכל הטופס יופיע.',
      'לחצו על פרסום.',
    ],
  },
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The iframe a studio pastes into its own site (form on the studio's OpalSwift host). */
export function embedIframe(formOrigin: string, title: string): string {
  const src = `${formOrigin}/embed/inquire?src=website`;
  return (
    `<iframe src="${escapeHtml(src)}" title="${escapeHtml(title)}" width="100%" height="900" ` +
    `style="border:0;max-width:640px" loading="lazy"></iframe>`
  );
}

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

function shell(lang: ShareLang, body: string): string {
  const dir = lang === 'he' ? 'rtl' : 'ltr';
  return (
    `<!doctype html><html lang="${lang}" dir="${dir}"><body style="font-family:Arial,Helvetica,sans-serif;` +
    `font-size:15px;line-height:1.5;color:#111827;max-width:560px;margin:0 auto;padding:16px">${body}</body></html>`
  );
}

function button(href: string, label: string, colour: string): string {
  return (
    `<p><a href="${escapeHtml(href)}" style="display:inline-block;background:${colour};color:#ffffff;` +
    `text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${escapeHtml(label)}</a></p>`
  );
}

const HEX_RE = /^#[0-9a-f]{6}$/i;

/**
 * "<Studio> sent you its enquiry form": the link only. No marketing content,
 * and no consent is implied by receiving it.
 */
export function formLinkEmail(input: {
  studio: string;
  recipientName?: string | null;
  formUrl: string;
  lang: ShareLang;
  colour?: string | null;
}): BuiltEmail {
  const { studio, formUrl, lang } = input;
  const name = input.recipientName?.trim();
  const colour = input.colour && HEX_RE.test(input.colour) ? input.colour : '#4A58E8';
  const he = lang === 'he';
  const subject = he ? `טופס פנייה של ${studio}` : `${studio}: enquiry form`;
  const greeting = name ? (he ? `שלום ${name},` : `Hello ${name},`) : he ? 'שלום,' : 'Hello,';
  const line = he
    ? `${studio} שלחו לכם את טופס הפנייה שלהם. מלאו אותו ונחזור אליכם.`
    : `${studio} sent you their enquiry form. Fill it in and they will get back to you.`;
  const cta = he ? 'פתיחת הטופס' : 'Open the form';
  const reply = he ? 'אפשר גם להשיב למייל הזה.' : 'You can also reply to this email.';
  const html = shell(
    lang,
    `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(line)}</p>${button(formUrl, cta, colour)}` +
      `<p style="font-size:13px;color:#4B5563" dir="ltr">${escapeHtml(formUrl)}</p><p>${escapeHtml(reply)}</p>`,
  );
  const text = `${greeting}\n\n${line}\n\n${formUrl}\n\n${reply}\n`;
  return { subject, html, text };
}

/** "How to add <Studio>'s enquiry form to the website": the code plus steps per builder. */
export function websiteInstructionsEmail(input: {
  studio: string;
  formOrigin: string;
  lang: ShareLang;
}): BuiltEmail {
  const { studio, formOrigin, lang } = input;
  const he = lang === 'he';
  const iframe = embedIframe(formOrigin, he ? `${studio} – טופס פנייה` : `${studio} – enquiry form`);
  const subject = he ? `הוספת טופס הפנייה של ${studio} לאתר` : `Adding ${studio}'s enquiry form to the website`;
  const intro = he
    ? `${studio} ביקשו להוסיף את טופס הפנייה שלהם לאתר. זה הקוד להדבקה:`
    : `${studio} would like their enquiry form on the website. This is the code to paste:`;
  const stepsTitle = he ? 'איך מדביקים:' : 'How to paste it:';
  const outro = he
    ? 'הטופס מתאים את עצמו לגודל המסך. שאלות? השיבו למייל הזה.'
    : 'The form adjusts to the screen size. Questions? Reply to this email.';
  const steps = WEBSITE_PLATFORMS.map(
    (p) =>
      `<p style="margin:12px 0 4px"><b>${WEBSITE_PLATFORM_NAMES[p]}</b></p><ol style="margin:0">` +
      WEBSITE_STEPS[lang][p].map((s) => `<li>${escapeHtml(s)}</li>`).join('') +
      '</ol>',
  ).join('');
  const html = shell(
    lang,
    `<p>${escapeHtml(intro)}</p>` +
      `<pre dir="ltr" style="white-space:pre-wrap;word-break:break-all;background:#F3F4F6;padding:12px;border-radius:6px;font-size:13px">${escapeHtml(iframe)}</pre>` +
      `<p>${escapeHtml(stepsTitle)}</p>${steps}<p>${escapeHtml(outro)}</p>`,
  );
  const textSteps = WEBSITE_PLATFORMS.map(
    (p) => `${WEBSITE_PLATFORM_NAMES[p]}\n${WEBSITE_STEPS[lang][p].map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
  ).join('\n\n');
  const text = `${intro}\n\n${iframe}\n\n${stepsTitle}\n\n${textSteps}\n\n${outro}\n`;
  return { subject, html, text };
}
