/**
 * Source and campaign tags for the public enquiry form. `src` picks the lead's
 * channel server-side (unknown → website); `campaign` is free text. UTM names
 * are accepted too, so a studio can reuse links it already has.
 */
export function readInquiryTags(params: URLSearchParams): { src: string | null; campaign: string | null } {
  const pick = (...names: string[]) => {
    for (const name of names) {
      const value = params.get(name)?.trim();
      if (value) return value;
    }
    return null;
  };
  return {
    src: pick('src', 'utm_source'),
    campaign: pick('campaign', 'utm_campaign'),
  };
}

export type EmbedLanguage = 'en' | 'he' | null;

/** Language forced by the embed snippet (?lang=), or null to follow the studio default. */
export function readEmbedLanguage(params: URLSearchParams): EmbedLanguage {
  const lang = params.get('lang');
  return lang === 'en' || lang === 'he' ? lang : null;
}

/**
 * The copy-paste snippet for a studio's own website. The form lives on the
 * studio's OpalSwift host, so the iframe needs no CORS or per-studio setup.
 */
export function buildEmbedSnippet(opts: {
  origin: string;
  /** Accessible iframe title, already translated (e.g. "Ballet Studio – enquiry form"). */
  title: string;
  campaign?: string | null;
  lang?: EmbedLanguage;
  /** Form path: '/inquire' (default) or '/f/<slug>'. The embed is the same path under /embed. */
  path?: string;
}): { url: string; iframe: string; link: string } {
  const params = new URLSearchParams({ src: 'website' });
  const campaign = opts.campaign?.trim();
  if (campaign) params.set('campaign', campaign);
  if (opts.lang) params.set('lang', opts.lang);
  const query = params.toString();
  const path = opts.path ?? '/inquire';
  const url = `${opts.origin}/embed${path}?${query}`;
  const title = escapeAttr(opts.title);
  const iframe =
    `<iframe src="${escapeAttr(url)}" title="${title}" width="100%" height="900" ` +
    `style="border:0;max-width:640px" loading="lazy"></iframe>`;
  return { url, iframe, link: `${opts.origin}${path}?${query}` };
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
