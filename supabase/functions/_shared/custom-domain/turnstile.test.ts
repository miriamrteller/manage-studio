/**
 * The Turnstile widget hostname client, against a fake Cloudflare API.
 * Run: cd supabase/functions && deno test --allow-env --allow-read --allow-net _shared/custom-domain/turnstile.test.ts
 */
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { turnstileHostnames } from "./turnstile.ts";

interface FakeWidget {
  sitekey: string;
  secret: string;
  name: string;
  domains: string[];
  mode: string;
  clearance_level: string;
  modified_on: string;
}

function fakeApi(start: Partial<FakeWidget> = {}, opts: { failGet?: number; onPut?: (w: FakeWidget) => void } = {}) {
  const widget: FakeWidget = {
    sitekey: "0x4AAA",
    secret: "0x4AAA-secret",
    name: "OpalSwift",
    domains: ["opalswift.com"],
    mode: "managed",
    clearance_level: "no_clearance",
    modified_on: "2026-11-01T00:00:00Z",
    ...start,
  };
  const puts: Record<string, unknown>[] = [];
  const seen: { url: string; method: string; auth: string | null }[] = [];
  const fetchFn = ((input: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    seen.push({ url: String(input), method, auth: new Headers(init?.headers).get("authorization") });
    if (method === "GET" && opts.failGet) {
      return Promise.resolve(Response.json({ success: false, errors: [{ message: "nope" }] }, { status: opts.failGet }));
    }
    if (method === "PUT") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      puts.push(body);
      Object.assign(widget, body);
      opts.onPut?.(widget);
    }
    return Promise.resolve(Response.json({ success: true, result: { ...widget } }));
  }) as typeof fetch;
  const client = turnstileHostnames({ token: "tok", accountId: "acct", siteKey: "0x4AAA", fetchFn });
  return { widget, puts, seen, client };
}

Deno.test("add: appends the hostname and sends back only the editable settings, never the secret", async () => {
  const api = fakeApi();
  assertEquals(await api.client.add("App.Harbour-Yoga.com."), "added");
  assertEquals(api.widget.domains, ["opalswift.com", "app.harbour-yoga.com"]);
  assertEquals(api.puts.length, 1);
  assertEquals(api.puts[0], {
    domains: ["opalswift.com", "app.harbour-yoga.com"],
    name: "OpalSwift",
    mode: "managed",
    clearance_level: "no_clearance",
  });
  assert(!("secret" in api.puts[0]) && !("sitekey" in api.puts[0]));
  assertEquals(api.seen[0].url, "https://api.cloudflare.com/client/v4/accounts/acct/challenges/widgets/0x4AAA");
  assertEquals(api.seen[0].auth, "Bearer tok");
});

Deno.test("add: already listed (exact match only) writes nothing", async () => {
  const api = fakeApi({ domains: ["opalswift.com", "app.harbour-yoga.com"] });
  assertEquals(await api.client.add("app.harbour-yoga.com"), "already_listed");
  assertEquals(api.puts.length, 0);
  // A parent domain on the list does not count: the exact hostname is still added.
  const parent = fakeApi({ domains: ["opalswift.com", "harbour-yoga.com"] });
  assertEquals(await parent.client.add("app.harbour-yoga.com"), "added");
});

Deno.test("add: a full widget (10 on the free plan) is reported, not written", async () => {
  const domains = ["opalswift.com", ...Array.from({ length: 9 }, (_, i) => `app.studio${i}.com`)];
  const api = fakeApi({ domains });
  assertEquals(await api.client.add("app.harbour-yoga.com"), "full");
  assertEquals(api.puts.length, 0);
});

Deno.test("add: a write lost to another request is retried once", async () => {
  let lost = false;
  const api = fakeApi({}, {
    onPut: (w) => {
      // Another request's PUT lands right after ours and drops our hostname.
      if (!lost) {
        lost = true;
        w.domains = ["opalswift.com", "app.other.com"];
      }
    },
  });
  assertEquals(await api.client.add("app.harbour-yoga.com"), "added");
  assertEquals(api.widget.domains, ["opalswift.com", "app.other.com", "app.harbour-yoga.com"]);
  assertEquals(api.puts.length, 2);
});

Deno.test("remove: takes the hostname off; not listed or last entry writes nothing", async () => {
  const api = fakeApi({ domains: ["opalswift.com", "app.harbour-yoga.com"] });
  await api.client.remove("app.harbour-yoga.com");
  assertEquals(api.widget.domains, ["opalswift.com"]);
  await api.client.remove("app.harbour-yoga.com");
  assertEquals(api.puts.length, 1);
  const only = fakeApi({ domains: ["app.harbour-yoga.com"] });
  await only.client.remove("app.harbour-yoga.com");
  assertEquals(only.puts.length, 0);
});

Deno.test("errors from Cloudflare throw", async () => {
  const api = fakeApi({}, { failGet: 403 });
  await assertRejects(() => api.client.add("app.harbour-yoga.com"), Error, "nope");
  await assertRejects(() => api.client.remove("app.harbour-yoga.com"), Error, "nope");
});
