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
const good = { name: "דנה כהן", email: "dana@example.com", message: "Invoices take me hours.\nHelp!" };
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
