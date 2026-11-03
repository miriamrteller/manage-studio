/**
 * Custom-domain hostname rules.
 * Run: cd supabase/functions && deno test --allow-env --allow-read --allow-net _shared/custom-domain/hostname.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { checkHostname, type HostnameErrorCode } from "./hostname.ts";

const ok = (input: string, hostname: string, registrableDomain: string) =>
  assertEquals(checkHostname(input), { ok: true, hostname, registrableDomain });
const bad = (input: unknown, code: HostnameErrorCode) => assertEquals(checkHostname(input), { ok: false, code });

Deno.test("a subdomain of a real domain is accepted and normalised", () => {
  ok("app.creativeballetacademy.com", "app.creativeballetacademy.com", "creativeballetacademy.com");
  ok("  App.CreativeBalletAcademy.com.  ", "app.creativeballetacademy.com", "creativeballetacademy.com");
  ok("https://app.studio.co.il/", "app.studio.co.il", "studio.co.il");
  ok("portal.app.studio.com", "portal.app.studio.com", "studio.com");
});

Deno.test("international names become punycode", () => {
  ok("app.בלט.co.il", "app.xn--5dbol.co.il", "xn--5dbol.co.il");
});

Deno.test("the bare domain is refused, including two-part suffixes", () => {
  bad("creativeballetacademy.com", "apex");
  bad("studio.co.il", "apex");
});

Deno.test("www, wildcards, IPs, paths and ports are refused", () => {
  bad("www.studio.com", "www");
  bad("*.studio.com", "wildcard");
  bad("192.168.1.10", "ip_address");
  bad("app.studio.com/login", "path_or_port");
  bad("app.studio.com:8080", "path_or_port");
  bad("user@app.studio.com", "path_or_port");
});

Deno.test("reserved first labels are refused", () => {
  for (const l of ["mail", "smtp", "mx", "autodiscover", "api", "admin", "ns1"]) bad(`${l}.studio.com`, "reserved");
});

Deno.test("our own and our providers' domains are refused", () => {
  bad("app.opalswift.com", "blocked_domain");
  bad("studio.opalswift.com", "blocked_domain");
  bad("x.supabase.co", "blocked_domain");
  bad("x.workers.dev", "blocked_domain");
  bad("x.pages.dev", "blocked_domain");
});

Deno.test("nonsense is refused", () => {
  bad("", "empty");
  bad("   ", "empty");
  bad(null, "empty");
  bad("app", "invalid");
  bad("app..studio.com", "invalid");
  bad("-app.studio.com", "invalid");
  bad("app_x.studio.com", "invalid");
  bad("app.studio.notarealtld", "unknown_suffix");
  bad(`${"a".repeat(64)}.studio.com`, "invalid");
  bad(`${"a.".repeat(130)}studio.com`, "too_long");
});
