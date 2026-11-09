/**
 * Spam check for every enquiry before it becomes a lead: the studio's own
 * enquiry form (crm-lead-capture) and the opalswift.com contact form and
 * lead emails (crm-lead-ingest). Pure, no Deno/Supabase imports, so it is
 * unit-tested directly (crm-lead-capture/spam.test.ts).
 *
 * It only looks for things a person never types:
 *   - a name with digits, a link or an email address in it, or one long
 *     jumbled word as a name;
 *   - letters and a long run of digits glued together ("ABCD2313558EFGH");
 *   - keyboard-mash words in the message ("gfihudwgfyehjwowjifwhu");
 *   - a sender address that imitates OpalSwift ("search-opalswift.com");
 *   - the usual "get listed on Google" sales pitch.
 * Names in any script are fine: only Latin words are checked for mashing,
 * and names more gently than messages, because real names (Krzysztof, Tzvi)
 * can look odd.
 */

export type LeadSpamReason =
  | "name_digits"
  | "name_link"
  | "gibberish_name"
  | "letters_digits_mix"
  | "gibberish_message"
  | "lookalike_email"
  | "seo_pitch";

export interface LeadSpamInput {
  name: string | null | undefined;
  email?: string | null;
  message?: string | null;
  /**
   * Check the message for mashing and glued digits. Off for forwarded lead
   * emails, whose bodies can hold codes and signatures; the SEO pitch check
   * still runs.
   */
  checkMessageShape?: boolean;
}

export interface LeadSpamResult {
  spam: boolean;
  reasons: LeadSpamReason[];
}

/**
 * For each letter, the letters that commonly follow it in English and
 * romanised names (built from ~19,000 distinct English words). A word made
 * mostly of other pairs is keyboard mashing.
 */
const COMMON_NEXT: Record<string, string> = {
  a: "abcdefghiklmnprstuvwxyz",
  b: "abcdeijlorsuy",
  c: "acehiklmoprstuy",
  d: "abcdefgilmnoprstuvy",
  e: "abcdefghijklmnopqrstuvwxy",
  f: "aefilorstuy",
  g: "aceghilmnoprstu",
  h: "aceilmnorstuy",
  i: "abcdefgklmnoprstuvxz",
  j: "aeosu",
  k: "aeiorst",
  l: "abcdefiklmoprstuvy",
  m: "abcdeilmnopsuvy",
  n: "abcdefghijklmnoprstuvwy",
  o: "abcdefghiklmnoprstuvwxy",
  p: "acdehiloprstuy",
  q: "u",
  r: "abcdefgiklmnoprstuvwy",
  s: "abcdefhiklmnoprstuvwy",
  t: "abcdefghilmnoprstuvwy",
  u: "abcdefgilmnoprst",
  v: "aeio",
  w: "aehinors",
  x: "aceipt",
  y: "abcdeilmnopst",
  z: "aeio",
};

/** Only words this long are judged: short words and names vary too much. */
const GIBBERISH_MIN_LENGTH = 10;
/** Name words: longer and more jumbled than message words before they count. */
const NAME_GIBBERISH_MIN_LENGTH = 12;
const NAME_GIBBERISH_RATIO = 0.4;
/** No one's name has a single word this long. */
const NAME_WORD_MAX_LENGTH = 16;

/** Share of uncommon letter pairs that makes a word a mash. */
const GIBBERISH_RATIO = 0.35;

const LINK_RE = /(https?:\/\/|www\.|\.(com|net|org|ru|io|xyz|info|biz|top)\b)/i;
const LETTERS_DIGITS_RE = /[a-z]{3,}\d{4,}[a-z]{3,}/i;
const URL_OR_EMAIL_RE = /(https?:\/\/\S+|www\.\S+|\S+@\S+|\S+\.(com|net|org|co\.il|io)\S*)/gi;

/** Phrases from "list your site on Google" sales spam. Lower case. */
const SEO_PITCH = [
  "google's search index",
  "googles search index",
  "google search index",
  "visible in google search",
  "search engine index",
  "submit your site",
  "submit your website",
  "seo services",
  "backlinks",
  "first page of google",
  "rank your website",
];

/** Share of letter pairs in a Latin word that are uncommon in English. */
export function uncommonPairRatio(word: string): number {
  const w = word.toLowerCase();
  let pairs = 0;
  let uncommon = 0;
  for (let i = 0; i < w.length - 1; i++) {
    const next = COMMON_NEXT[w[i]];
    if (!next) continue;
    pairs++;
    if (!next.includes(w[i + 1])) uncommon++;
  }
  return pairs === 0 ? 0 : uncommon / pairs;
}

export function isGibberishWord(word: string): boolean {
  if (!/^[a-z]+$/i.test(word) || word.length < GIBBERISH_MIN_LENGTH) return false;
  return uncommonPairRatio(word) >= GIBBERISH_RATIO;
}

/** Keyboard mashing: two or more mashed words, or one very long one. */
export function messageLooksMashed(message: string): boolean {
  const words = message.replace(URL_OR_EMAIL_RE, " ").match(/[a-z]+/gi) ?? [];
  const mashed = words.filter(isGibberishWord);
  if (mashed.length >= 2) return true;
  return mashed.some((w) => w.length >= 18);
}

export function nameLooksJumbled(name: string): boolean {
  const words = name.match(/[a-z]+/gi) ?? [];
  return words.some((w) =>
    w.length >= NAME_WORD_MAX_LENGTH ||
    (w.length >= NAME_GIBBERISH_MIN_LENGTH && uncommonPairRatio(w) >= NAME_GIBBERISH_RATIO)
  );
}

function emailImitatesOpalSwift(email: string): boolean {
  const domain = email.toLowerCase().split("@")[1]?.trim() ?? "";
  if (!domain.includes("opalswift")) return false;
  return domain !== "opalswift.com" && !domain.endsWith(".opalswift.com");
}

export function assessLeadSpam(input: LeadSpamInput): LeadSpamResult {
  const reasons = new Set<LeadSpamReason>();
  const name = (input.name ?? "").trim();
  const message = (input.message ?? "").trim();
  const email = (input.email ?? "").trim();

  if ((name.match(/\d/g) ?? []).length >= 3) reasons.add("name_digits");
  if (LINK_RE.test(name) || name.includes("@")) reasons.add("name_link");
  if (name && nameLooksJumbled(name)) reasons.add("gibberish_name");
  const shape = input.checkMessageShape !== false;
  const words = message.replace(URL_OR_EMAIL_RE, " ");
  if (LETTERS_DIGITS_RE.test(name) || (shape && LETTERS_DIGITS_RE.test(words))) {
    reasons.add("letters_digits_mix");
  }
  if (shape && message && messageLooksMashed(message)) reasons.add("gibberish_message");
  if (email && emailImitatesOpalSwift(email)) reasons.add("lookalike_email");
  const lower = message.toLowerCase().replace(/[’‘]/g, "'");
  if (SEO_PITCH.some((p) => lower.includes(p))) reasons.add("seo_pitch");

  return { spam: reasons.size > 0, reasons: [...reasons] };
}

/** Faster than this from the form opening to sending: a script, not a person. */
export const MIN_FILL_MS = 3000;

/**
 * Time trap. `elapsedMs` is how long the form was open before sending, as
 * the page reports it. Missing (no JavaScript, older page) passes.
 */
export function filledTooFast(elapsedMs: number | null | undefined): boolean {
  if (typeof elapsedMs !== "number" || !Number.isFinite(elapsedMs)) return false;
  return elapsedMs >= 0 && elapsedMs < MIN_FILL_MS;
}
