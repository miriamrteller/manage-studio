/**
 * The Leads page links to the studio's hosted enquiry form at
 * `<origin>/inquire?…` (or `/embed/inquire?…`). In the demo that origin is the
 * artifact host, where those paths load nothing, so the demo opens its own
 * `#/inquire?…` route instead. Returns null for any other URL.
 */
export function hostedFormHash(url: string, base: string = window.location.href): string | null {
  let u: URL;
  try {
    u = new URL(url, base);
  } catch {
    return null;
  }
  if (u.origin !== new URL(base).origin || !/^\/(embed\/)?inquire\/?$/.test(u.pathname)) return null;
  return `#/inquire${u.search}`;
}
