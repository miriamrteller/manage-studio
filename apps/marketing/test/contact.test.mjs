// Unit tests for functions/api/contact.js (node --test, no dependencies).
// Kept outside functions/: every file there becomes a public route.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { onRequest, LIMITS } from "../functions/api/contact.js";

const URL_ = "https://opalswift.com/api/contact";
const ENV = { RESEND_API_KEY: "re_test_key" };
let calls;
const realFetch = globalThis.fetch;
const realError = console.error;
let logged;

beforeEach(() => {
  calls = [];
  logged = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response('{"id":"x"}', { status: 200 });
  };
  console.error = (...a) => logged.push(a.join(" "));
});
afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realError;
});

function form(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}
function post(body, headers = {}) {
  return new Request(URL_, { method: "POST", body, headers: { origin: "https://opalswift.com", ...headers } });
}
// shown_at: the page's timer, as a person a minute into the form would send it.
const good = {
  name: "דנה כהן",
  email: "dana@example.com",
  message: "Invoices take me hours.\nHelp!",
  shown_at: String(Date.now() - 60_000),
};
const call = (request, env = ENV) => onRequest({ request, env });

test("valid submission → 200 {ok:true}, one Resend email", async () => {
  const res = await call(post(form(good)));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(calls.length, 1);
  const { url, init, body } = calls[0];
  assert.equal(url, "https://api.resend.com/emails");
  assert.equal(init.headers.authorization, "Bearer re_test_key");
  assert.equal(body.from, "OpalSwift <no-reply@opalswift.com>");
  assert.deepEqual(body.to, ["hello@opalswift.com"]);
  assert.equal(body.reply_to, "dana@example.com");
  assert.equal(body.subject, "OpalSwift beta: דנה כהן");
  assert.match(body.text, /Invoices take me hours\.\nHelp!/);
});

test("CONTACT_TO overrides the recipient", async () => {
  await call(post(form(good)), { ...ENV, CONTACT_TO: "team@opalswift.com" });
  assert.deepEqual(calls[0].body.to, ["team@opalswift.com"]);
});

test("urlencoded bodies are accepted too", async () => {
  const res = await call(post(new URLSearchParams(good)));
  assert.equal(res.status, 200);
});

test("HTML is escaped and CR/LF stripped from the subject", async () => {
  await call(post(form({ ...good, name: 'Eve\r\nBcc: x@y.z <b>', message: "<script>alert(1)</script>" })));
  const { body } = calls[0];
  assert.equal(body.subject, "OpalSwift beta: Eve Bcc: x@y.z <b>");
  assert.ok(!body.html.includes("<script>"));
  assert.ok(body.html.includes("&lt;script&gt;"));
  assert.ok(body.html.includes("&lt;b&gt;"));
});

test("non-POST → 405", async () => {
  const res = await call(new Request(URL_));
  assert.equal(res.status, 405);
  assert.equal(res.headers.get("allow"), "POST");
  assert.equal((await res.json()).ok, false);
});

test("empty POST (deploy smoke check) → JSON error, no email", async () => {
  const res = await call(new Request(URL_, { method: "POST" }));
  assert.equal(res.status, 415);
  assert.equal((await res.json()).ok, false);
  assert.equal(calls.length, 0);
});

test("JSON body → 415", async () => {
  const res = await call(post(JSON.stringify(good), { "content-type": "application/json" }));
  assert.equal(res.status, 415);
});

test("cross-site Origin → 403", async () => {
  const res = await call(post(form(good), { origin: "https://evil.example" }));
  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
});

for (const missing of ["name", "email", "message"]) {
  test(`missing ${missing} → 400`, async () => {
    const res = await call(post(form({ ...good, [missing]: "   " })));
    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
  });
}

test("bad email → 400", async () => {
  for (const email of ["not-an-email", "a@b", "a b@c.com", "x@y.z<script>"]) {
    const res = await call(post(form({ ...good, email })));
    assert.equal(res.status, 400, email);
  }
  assert.equal(calls.length, 0);
});

test("too-long field → 400", async () => {
  const res = await call(post(form({ ...good, name: "n".repeat(LIMITS.name + 1) })));
  assert.equal(res.status, 400);
});

test("body over the size cap → 413", async () => {
  const res = await call(post(form({ ...good, message: "m".repeat(LIMITS.body) })));
  assert.equal(res.status, 413);
  assert.equal(calls.length, 0);
});

test("honeypot filled → pretend success, no email", async () => {
  const res = await call(post(form({ ...good, website: "http://spam.example" })));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(calls.length, 0);
});

test("no RESEND_API_KEY → 500, logged without data", async () => {
  const res = await call(post(form(good)), {});
  assert.equal(res.status, 500);
  assert.equal(calls.length, 0);
  assert.equal(logged.length, 1);
  assert.ok(!logged[0].includes("dana"));
});

test("Resend error → 502; log has status only, no key or submission", async () => {
  globalThis.fetch = async () => new Response("bad", { status: 422 });
  const res = await call(post(form(good)));
  assert.equal(res.status, 502);
  assert.equal((await res.json()).ok, false);
  assert.equal(logged.length, 1);
  assert.ok(logged[0].includes("422"));
  for (const secret of ["re_test_key", "dana@example.com", "Invoices"]) assert.ok(!logged[0].includes(secret));
});

test("Resend unreachable → 502", async () => {
  globalThis.fetch = async () => {
    throw new Error("network");
  };
  const res = await call(post(form(good)));
  assert.equal(res.status, 502);
});

// ---- Filing the enquiry in HQ's Leads (crm-lead-ingest) -------------------
const INGEST = "https://ref.supabase.co/functions/v1/crm-lead-ingest";
const LEAD_ENV = { ...ENV, HQ_LEAD_INGEST_URL: INGEST, CRM_INGEST_SECRET: "ingest-secret-value" };
function routeFetch(handlers) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const h = handlers[url];
    if (h instanceof Error) throw h;
    return new Response("{}", { status: h ?? 200 });
  };
}

test("with the lead settings: emails AND files a website lead in hq", async () => {
  const res = await call(post(form(good)), LEAD_ENV);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  const lead = calls.find((c) => c.url === INGEST);
  assert.ok(lead, "crm-lead-ingest was called");
  assert.ok(calls.some((c) => c.url === "https://api.resend.com/emails"), "the email still goes out");
  assert.equal(lead.init.method, "POST");
  assert.equal(lead.init.headers.authorization, "Bearer ingest-secret-value");
  assert.equal(lead.body.tenantSubdomain, "hq");
  assert.equal(lead.body.contact.name, good.name);
  assert.equal(lead.body.contact.email, good.email);
  assert.equal(lead.body.contact.message, good.message);
  assert.match(lead.body.contact.submissionId, /^[0-9a-f-]{36}$/);
});

test("HQ_SUBDOMAIN picks another studio", async () => {
  await call(post(form(good)), { ...LEAD_ENV, HQ_SUBDOMAIN: "hq-test" });
  assert.equal(calls.find((c) => c.url === INGEST).body.tenantSubdomain, "hq-test");
});

test("without the lead settings: only the email (as before)", async () => {
  for (const env of [ENV, { ...ENV, HQ_LEAD_INGEST_URL: INGEST }, { ...ENV, CRM_INGEST_SECRET: "x" }]) {
    calls = [];
    const res = await call(post(form(good)), env);
    assert.equal(res.status, 200);
    assert.deepEqual(calls.map((c) => c.url), ["https://api.resend.com/emails"]);
  }
});

test("hq not created yet (404) or a wrong secret (401): still success, logged without the submission", async () => {
  for (const status of [404, 401, 503, 500]) {
    calls = [];
    logged = [];
    routeFetch({ [INGEST]: status });
    const res = await call(post(form(good)), LEAD_ENV);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(logged.length, 1);
    assert.match(logged[0], new RegExp(`answered ${status}`));
    for (const secret of [good.name, good.email, "Invoices", "ingest-secret-value"]) {
      assert.ok(!logged[0].includes(secret), `log must not contain ${secret}`);
    }
  }
});

test("crm-lead-ingest unreachable: still success, logged", async () => {
  routeFetch({ [INGEST]: new Error("network down") });
  const res = await call(post(form(good)), LEAD_ENV);
  assert.equal(res.status, 200);
  assert.match(logged.join("\n"), /could not reach crm-lead-ingest/);
});

test("the email failing still fails the request (the lead is only a copy)", async () => {
  routeFetch({ "https://api.resend.com/emails": 500 });
  const res = await call(post(form(good)), LEAD_ENV);
  assert.equal(res.status, 502);
  assert.ok(calls.some((c) => c.url === INGEST), "the lead was still filed");
});

test("honeypot and invalid submissions file no lead", async () => {
  await call(post(form({ ...good, website: "http://spam" })), LEAD_ENV);
  await call(post(form({ ...good, email: "nope" })), LEAD_ENV);
  await call(post(form({ ...good, message: "" })), LEAD_ENV);
  assert.equal(calls.filter((c) => c.url === INGEST).length, 0);
});

// ---- Spam ---------------------------------------------------------------
test("sent within seconds of the form showing → pretend success, no email, no lead", async () => {
  const res = await call(post(form({ ...good, shown_at: String(Date.now() - 500) })), LEAD_ENV);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(calls.length, 0);
});

test("a person taking their time goes through", async () => {
  const res = await call(post(form({ ...good, shown_at: String(Date.now() - 20_000) })), LEAD_ENV);
  assert.equal(res.status, 200);
  assert.ok(calls.some((c) => c.url === "https://api.resend.com/emails"));
});

test("no page timer, or junk in it (a script posting directly) → pretend success, no email, no lead", async () => {
  const { shown_at: _omit, ...withoutTimer } = good;
  for (const fields of [withoutTimer, { ...good, shown_at: "" }, { ...good, shown_at: "junk" }]) {
    calls = [];
    const res = await call(post(form(fields)), LEAD_ENV);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(calls.length, 0);
  }
});

test("crm-lead-ingest says spam → 422, no email", async () => {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(url === INGEST ? { outcome: "spam" } : { id: "x" }), { status: 200 });
  };
  const res = await call(post(form(good)), LEAD_ENV);
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, "looks_like_spam");
  assert.deepEqual(calls.map((c) => c.url), [INGEST]);
});

test("crm-lead-ingest says own_email (the team's own address) → 422 own_email, no email", async () => {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(url === INGEST ? { outcome: "own_email" } : { id: "x" }), { status: 200 });
  };
  const res = await call(post(form(good)), LEAD_ENV);
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, "own_email");
  assert.deepEqual(calls.map((c) => c.url), [INGEST]);
});
