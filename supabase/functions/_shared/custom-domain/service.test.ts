/**
 * Self-serve custom domains: request, check, pause, remove and the poller,
 * against a fake Cloudflare and an in-memory table.
 * Run: cd supabase/functions && deno test --allow-env --allow-read --allow-net _shared/custom-domain/service.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { CfCustomHostname, CloudflareSaas } from "./cloudflare.ts";
import type { TurnstileHostnames } from "./turnstile.ts";
import {
  checkDomain,
  type Deps,
  type DomainRow,
  pollDomains,
  problemCode,
  removeDomain,
  requestDomain,
} from "./service.ts";

const T1 = "tenant-1";
const T2 = "tenant-2";
const HOST = "app.harbour-yoga.com";

function setup(
  opts: { enabled?: boolean; ownZones?: string[]; cfFails?: boolean; widgetLimit?: number; noTurnstile?: boolean } = {},
) {
  let clock = new Date("2026-11-03T10:00:00Z");
  const rows: DomainRow[] = [];
  const cfHosts = new Map<string, CfCustomHostname>();
  const tenantDomain = new Map<string, string | null>();
  const calls = { cfCreate: 0, cfGet: 0, cfRemove: 0, changed: 0 };
  let seq = 0;
  // The Turnstile widget's hostname list (opalswift.com is always on it).
  const widget = { domains: ["opalswift.com"], fails: false, limit: opts.widgetLimit ?? 10 };
  const alerts: { message: string; tags: Record<string, string> }[] = [];
  const turnstile: TurnstileHostnames = {
    add(hostname) {
      if (widget.fails) return Promise.reject(new Error("down"));
      if (widget.domains.includes(hostname)) return Promise.resolve("already_listed");
      if (widget.domains.length >= widget.limit) return Promise.resolve("full");
      widget.domains.push(hostname);
      return Promise.resolve("added");
    },
    remove(hostname) {
      if (widget.fails) return Promise.reject(new Error("down"));
      widget.domains = widget.domains.filter((d) => d !== hostname);
      return Promise.resolve();
    },
  };
  const cf: CloudflareSaas = {
    create(hostname) {
      calls.cfCreate++;
      if (opts.cfFails) return Promise.reject(new Error("down"));
      const h: CfCustomHostname = {
        id: `cf-${++seq}`, hostname, status: "pending",
        ssl: { status: "pending_validation", validation_records: [{ txt_name: `_acme-challenge.${hostname}`, txt_value: "cert-token" }] },
        ownership_verification: { type: "txt", name: `_cf-custom-hostname.${hostname}`, value: "own-token" },
      };
      cfHosts.set(h.id, h);
      return Promise.resolve(h);
    },
    get(id) {
      calls.cfGet++;
      return Promise.resolve(cfHosts.get(id) ?? null);
    },
    remove(id) {
      calls.cfRemove++;
      cfHosts.delete(id);
      return Promise.resolve();
    },
  };
  const deps: Deps = {
    now: () => clock,
    cf,
    cnameTarget: "proxy-fallback.opalswift.com",
    ownZones: new Set(opts.ownZones ?? []),
    enabled: () => Promise.resolve(opts.enabled ?? true),
    hostnameAvailable: (tenantId, hostname) =>
      Promise.resolve(!rows.some((r) => r.hostname === hostname && r.tenant_id !== tenantId && r.status !== "removed")),
    liveRow: (tenantId) => Promise.resolve(rows.find((r) => r.tenant_id === tenantId && r.status !== "removed") ?? null),
    insertRow: (row) => {
      const full = { ...row, id: `row-${rows.length + 1}` } as DomainRow;
      rows.push(full);
      return Promise.resolve(full);
    },
    updateRow: (id, patch) => {
      const r = rows.find((x) => x.id === id)!;
      Object.assign(r, patch);
      return Promise.resolve(r);
    },
    setTenantDomain: (tenantId, hostname) => {
      tenantDomain.set(tenantId, hostname);
      return Promise.resolve();
    },
    pollCandidates: () => Promise.resolve(rows.filter((r) => r.status !== "removed" && r.status !== "active")),
    activeDomainsChanged: () => {
      calls.changed++;
      return Promise.resolve();
    },
    turnstile: opts.noTurnstile ? null : turnstile,
    alert: (message, tags) => {
      alerts.push({ message, tags });
      return Promise.resolve();
    },
  };
  return {
    deps, rows, cfHosts, tenantDomain, calls, widget, alerts,
    advance(hours: number) {
      clock = new Date(clock.getTime() + hours * 3_600_000);
    },
    activate(id: string) {
      const h = cfHosts.get(id)!;
      h.status = "active";
      h.ssl = { status: "active", validation_records: [] };
    },
  };
}

const isRow = (x: unknown): x is DomainRow => typeof x === "object" && x !== null && "hostname" in x;

Deno.test("request: creates the Cloudflare hostname and shows the CNAME, ownership and certificate records", async () => {
  const s = setup();
  const row = await requestDomain(s.deps, T1, "u1", " https://APP.Harbour-Yoga.com/ ");
  assert(isRow(row));
  assertEquals(row.hostname, HOST);
  assertEquals(row.status, "pending");
  assertEquals(row.dns_records.map((r) => [r.type, r.purpose]), [["CNAME", "route"], ["TXT", "ownership"], ["TXT", "certificate"]]);
  assertEquals(row.dns_records[0].value, "proxy-fallback.opalswift.com");
  assertEquals(row.auto_check_until, "2026-11-04T10:00:00.000Z"); // 24 hours
  assertEquals(row.delete_after, "2026-12-03T10:00:00.000Z"); // 30 days
});

Deno.test("request: refused when off, invalid, taken, a second domain, or Cloudflare is down", async () => {
  assertEquals(await requestDomain(setup({ enabled: false }).deps, T1, "u1", HOST), { error: "not_enabled" });
  assertEquals(await requestDomain(setup().deps, T1, "u1", "harbour-yoga.com"), { error: "invalid_hostname", code: "apex" });
  const s = setup();
  await requestDomain(s.deps, T1, "u1", HOST);
  assertEquals(await requestDomain(s.deps, T2, "u2", HOST), { error: "hostname_taken" });
  assertEquals(await requestDomain(s.deps, T1, "u1", "app.other.com"), { error: "already_has_domain" });
  const down = setup({ cfFails: true });
  assertEquals(await requestDomain(down.deps, T1, "u1", HOST), { error: "cloudflare_unavailable" });
  assertEquals(down.rows.length, 0);
});

Deno.test("request: a zone in our own Cloudflare account is connected by OpalSwift, no SaaS hostname", async () => {
  const s = setup({ ownZones: ["creativeballetacademy.com"] });
  const row = await requestDomain(s.deps, T1, "u1", "app.creativeballetacademy.com");
  assert(isRow(row));
  assertEquals([row.managed_by, row.error_code, row.cf_hostname_id], ["opalswift", "opalswift_connects", null]);
  assertEquals(s.calls.cfCreate, 0);
  assertEquals(await checkDomain(s.deps, row, true), { error: "managed_by_opalswift" });
});

Deno.test("check: active at Cloudflare sets the studio's domain once and tells the allowlist sync", async () => {
  const s = setup();
  const row = await requestDomain(s.deps, T1, "u1", HOST) as DomainRow;
  const pending = await checkDomain(s.deps, row, false) as DomainRow;
  assertEquals(pending.status, "pending");
  assertEquals(s.tenantDomain.get(T1), undefined);
  s.activate(row.cf_hostname_id!);
  const active = await checkDomain(s.deps, row, false) as DomainRow;
  assertEquals([active.status, active.delete_after], ["active", null]);
  assertEquals(s.tenantDomain.get(T1), HOST);
  assertEquals(s.calls.changed, 1);
  await checkDomain(s.deps, active, true);
  assertEquals(s.calls.changed, 1);
});

Deno.test("problem codes in plain words", () => {
  const h = (errs: string[]): CfCustomHostname => ({ id: "x", hostname: HOST, status: "pending", verification_errors: errs });
  assertEquals(problemCode(h([])), null);
  assertEquals(problemCode(h(["custom hostname does not CNAME to this zone."])), "dns_not_pointing");
  assertEquals(problemCode(h(["CAA records block issuance"])), "caa_blocked");
  assertEquals(problemCode(h(["TXT record not found for ownership"])), "ownership_txt_missing");
});

Deno.test("poller: checks inside 24 hours, then pauses without calling Cloudflare", async () => {
  const s = setup();
  await requestDomain(s.deps, T1, "u1", HOST);
  assertEquals(await pollDomains(s.deps), { checked: 1, paused: 0, deleted: 0 });
  assertEquals(s.calls.cfGet, 1);
  s.advance(25);
  assertEquals(await pollDomains(s.deps), { checked: 0, paused: 1, deleted: 0 });
  assertEquals(s.rows[0].status, "paused");
  assertEquals(await pollDomains(s.deps), { checked: 0, paused: 0, deleted: 0 });
  assertEquals(s.calls.cfGet, 1); // no Cloudflare calls while paused
  assertEquals(s.cfHosts.size, 1); // hostname kept during the pause
});

Deno.test("Check now after a pause: checks at once and opens a new 24-hour window", async () => {
  const s = setup();
  const row = await requestDomain(s.deps, T1, "u1", HOST) as DomainRow;
  s.advance(30);
  await pollDomains(s.deps);
  assertEquals(row.status, "paused");
  s.activate(row.cf_hostname_id!);
  const after = await checkDomain(s.deps, row, true) as DomainRow;
  assertEquals(after.status, "active");
  const s2 = setup();
  const r2 = await requestDomain(s2.deps, T1, "u1", HOST) as DomainRow;
  s2.advance(30);
  await pollDomains(s2.deps);
  const reopened = await checkDomain(s2.deps, r2, true) as DomainRow;
  assertEquals(reopened.status, "pending");
  assertEquals(reopened.auto_check_until, "2026-11-05T16:00:00.000Z"); // now (+30h) + 24h
});

Deno.test("poller: never-activated hostnames are deleted from Cloudflare after 30 days", async () => {
  const s = setup();
  await requestDomain(s.deps, T1, "u1", HOST);
  s.advance(24 * 30 + 1);
  assertEquals(await pollDomains(s.deps), { checked: 0, paused: 0, deleted: 1 });
  assertEquals([s.rows[0].status, s.rows[0].error_code], ["removed", "expired_unactivated"]);
  assertEquals(s.cfHosts.size, 0);
});

Deno.test("remove: needs the hostname typed again; deletes at Cloudflare first, then clears the studio's domain", async () => {
  const s = setup();
  const row = await requestDomain(s.deps, T1, "u1", HOST) as DomainRow;
  s.activate(row.cf_hostname_id!);
  await checkDomain(s.deps, row, false);
  assertEquals(await removeDomain(s.deps, T1, "app.wrong.com"), { error: "confirm_mismatch" });
  assertEquals(await removeDomain(s.deps, T1, undefined), { error: "confirm_mismatch" });
  const removed = await removeDomain(s.deps, T1, " APP.harbour-yoga.com ") as DomainRow;
  assertEquals(removed.status, "removed");
  assertEquals(s.cfHosts.size, 0);
  assertEquals(s.tenantDomain.get(T1), null);
  assertEquals(s.calls.changed, 2); // activated, then removed
  assertEquals(await removeDomain(s.deps, T1, HOST), { error: "no_domain" });
});

Deno.test("turnstile: the domain is put on the widget before it goes live", async () => {
  const s = setup();
  const row = await requestDomain(s.deps, T1, "u1", HOST);
  assert(isRow(row));
  s.activate(row.cf_hostname_id!);
  const checked = await checkDomain(s.deps, row, false);
  assert(isRow(checked));
  assertEquals(checked.status, "active");
  assertEquals(s.widget.domains, ["opalswift.com", HOST]);
  assertEquals(s.tenantDomain.get(T1), HOST);
  assertEquals(s.alerts.length, 0);
});

Deno.test("turnstile: a full widget keeps the domain waiting, alerts the owner once, then goes live when a slot frees", async () => {
  const s = setup({ widgetLimit: 1 });
  const row = await requestDomain(s.deps, T1, "u1", HOST);
  assert(isRow(row));
  s.activate(row.cf_hostname_id!);
  const first = await checkDomain(s.deps, row, false);
  assert(isRow(first));
  assertEquals(first.status, "pending");
  assertEquals(first.error_code, "turnstile_full");
  assertEquals(s.tenantDomain.get(T1), undefined);
  assertEquals(s.calls.changed, 0);
  assertEquals(s.alerts.length, 1);
  assertEquals(s.alerts[0].tags.hostname, HOST);

  await pollDomains(s.deps); // still full: no second alert
  assertEquals(s.alerts.length, 1);
  assertEquals(s.rows[0].error_code, "turnstile_full");

  s.widget.limit = 10; // the owner frees a slot
  await pollDomains(s.deps);
  assertEquals(s.rows[0].status, "active");
  assertEquals(s.rows[0].error_code, null);
  assertEquals(s.tenantDomain.get(T1), HOST);
});

Deno.test("turnstile: widget API down — the poller waits, Check now reports it, nothing goes live", async () => {
  const s = setup();
  const row = await requestDomain(s.deps, T1, "u1", HOST);
  assert(isRow(row));
  s.activate(row.cf_hostname_id!);
  s.widget.fails = true;
  const polled = await checkDomain(s.deps, row, false);
  assert(isRow(polled));
  assertEquals(polled.status, "pending");
  assertEquals(await checkDomain(s.deps, row, true), { error: "cloudflare_unavailable" });
  assertEquals(s.tenantDomain.get(T1), undefined);
});

Deno.test("turnstile: removing a live domain frees its slot; a failure alerts but never blocks removal", async () => {
  const s = setup();
  const row = await requestDomain(s.deps, T1, "u1", HOST);
  assert(isRow(row));
  s.activate(row.cf_hostname_id!);
  await checkDomain(s.deps, row, false);
  const removed = await removeDomain(s.deps, T1, HOST);
  assert(isRow(removed));
  assertEquals(s.widget.domains, ["opalswift.com"]);

  const s2 = setup();
  const row2 = await requestDomain(s2.deps, T1, "u1", HOST);
  assert(isRow(row2));
  s2.activate(row2.cf_hostname_id!);
  await checkDomain(s2.deps, row2, false);
  s2.widget.fails = true;
  const removed2 = await removeDomain(s2.deps, T1, HOST);
  assert(isRow(removed2));
  assertEquals(removed2.status, "removed");
  assertEquals(s2.tenantDomain.get(T1), null);
  assertEquals(s2.alerts.length, 1);
});

Deno.test("turnstile: Check now on a live domain puts it back on the widget if it went missing", async () => {
  const s = setup();
  const row = await requestDomain(s.deps, T1, "u1", HOST);
  assert(isRow(row));
  s.activate(row.cf_hostname_id!);
  await checkDomain(s.deps, row, false);
  s.widget.domains = ["opalswift.com"]; // dropped by hand or by a racing write
  await checkDomain(s.deps, s.rows[0], true);
  assertEquals(s.widget.domains, ["opalswift.com", HOST]);
});

Deno.test("turnstile: without a site key (no bot check in the app) domains go live as before", async () => {
  const s = setup({ noTurnstile: true });
  const row = await requestDomain(s.deps, T1, "u1", HOST);
  assert(isRow(row));
  s.activate(row.cf_hostname_id!);
  const checked = await checkDomain(s.deps, row, false);
  assert(isRow(checked));
  assertEquals(checked.status, "active");
});
