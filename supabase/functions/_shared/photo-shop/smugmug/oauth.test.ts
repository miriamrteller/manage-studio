import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  authorizeUrl,
  getAccessToken,
  getRequestToken,
  oauthEncode,
  oauthHeader,
  pendingMatches,
  SMUGMUG_ACCESS_TOKEN_URL,
  SMUGMUG_AUTHUSER_URL,
  SMUGMUG_REQUEST_TOKEN_URL,
  testSmugMugConnection,
  type FetchLike,
} from "./oauth.ts";

// OAuth Core 1.0 Appendix A worked example (HMAC-SHA1, oauth_version 1.0; the same signing as 1.0a).
const rfcClock = { now: () => 1191242096, nonce: () => "kllo9940pd9333jh" };

Deno.test("signature matches the OAuth spec example", async () => {
  const header = await oauthHeader(
    "GET",
    "http://photos.example.net/photos?file=vacation.jpg&size=original",
    { apiKey: "dpf43f3p2l4k3l03", apiSecret: "kd94hf93k423kf44" },
    { token: "nnch734d00sl2jdk", secret: "pfkkdhi9sl3r4s00" },
    {},
    rfcClock,
  );
  assertMatch(header, /oauth_signature="tR3%2BTy81lMeYAr%2FFid0kMTYa%2FWM%3D"/);
});

Deno.test("percent-encoding follows RFC 5849", () => {
  assertEquals(oauthEncode("a b!*'()~-._"), "a%20b%21%2A%27%28%29~-._");
});

Deno.test("sign-in asks for Access=Full and Permissions=Read", () => {
  const u = new URL(authorizeUrl("rt"));
  assertEquals(u.origin + u.pathname, "https://api.smugmug.com/services/oauth/1.0a/authorize");
  assertEquals(u.searchParams.get("oauth_token"), "rt");
  assertEquals(u.searchParams.get("Access"), "Full");
  assertEquals(u.searchParams.get("Permissions"), "Read");
});

const keys = { apiKey: "k", apiSecret: "s" };

function fakeFetch(handler: (url: string, auth: string) => Response): { fetch: FetchLike; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fetch: (url, init) => {
      const auth = new Headers(init?.headers).get("Authorization") ?? "";
      calls.push(url);
      return Promise.resolve(handler(url, auth));
    },
  };
}

Deno.test("request and access tokens: callback and verifier are signed in", async () => {
  const f = fakeFetch((url, auth) => {
    if (url === SMUGMUG_REQUEST_TOKEN_URL) {
      assertMatch(auth, /oauth_callback="https%3A%2F%2Fapp.example%2Fcb"/);
      return new Response("oauth_token=rt&oauth_token_secret=rs&oauth_callback_confirmed=true");
    }
    assertEquals(url, SMUGMUG_ACCESS_TOKEN_URL);
    assertMatch(auth, /oauth_token="rt"/);
    assertMatch(auth, /oauth_verifier="123456"/);
    return new Response("oauth_token=at&oauth_token_secret=as");
  });
  const rt = await getRequestToken(keys, "https://app.example/cb", { fetch: f.fetch });
  assertEquals(rt, { token: "rt", secret: "rs" });
  assertEquals(await getAccessToken(keys, rt, "123456", { fetch: f.fetch }), { token: "at", secret: "as" });
});

Deno.test("Test connection: keys only uses a request token, connected uses !authuser", async () => {
  const ok = fakeFetch((url) =>
    url === SMUGMUG_AUTHUSER_URL ? new Response("{}") : new Response("oauth_token=rt&oauth_token_secret=rs")
  );
  assertEquals(await testSmugMugConnection(keys, null, { fetch: ok.fetch }), { ok: true, stage: "keys" });
  assertEquals(ok.calls, [SMUGMUG_REQUEST_TOKEN_URL]);
  assertEquals(await testSmugMugConnection(keys, { token: "a", secret: "b" }, { fetch: ok.fetch }), { ok: true, stage: "account" });
  assertEquals(ok.calls[1], SMUGMUG_AUTHUSER_URL);

  const refused = fakeFetch(() => new Response("no", { status: 401 }));
  assertEquals(await testSmugMugConnection(keys, null, { fetch: refused.fetch }), { ok: false, code: "keys_rejected" });
  assertEquals(await testSmugMugConnection(keys, { token: "a", secret: "b" }, { fetch: refused.fetch }), { ok: false, code: "token_rejected" });

  const down: FetchLike = () => Promise.reject(new Error("network"));
  assertEquals(await testSmugMugConnection(keys, null, { fetch: down }), { ok: false, code: "unreachable" });
});

Deno.test("callback must match the pending request, admin and time", () => {
  const p = { token: "rt", secret: "rs", uid: "u1", exp: 1000 };
  assert(pendingMatches(p, "rt", "u1", 999));
  assert(!pendingMatches(p, "rt", "u1", 1001));
  assert(!pendingMatches(p, "other", "u1", 999));
  assert(!pendingMatches(p, "rt", "u2", 999));
  assert(!pendingMatches(null, "rt", "u1", 999));
});
