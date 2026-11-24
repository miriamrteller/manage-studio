import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildSystemPrompt,
  buildUserContent,
  guideIdsFor,
  parseReply,
  replyJsonSchema,
  requestSchema,
  startOfUtcDay,
} from "./assistant.ts";

const ids = guideIdsFor("en");
const emptyPrefill = {
  kind: "none", client_name: "", client_email: "", client_phone: "", package_name: "",
  date: "", time: "", location: "", name: "", price: "", duration_hours: "",
};
const reply = (over: Record<string, unknown>) =>
  JSON.stringify({ answer: "Open Shoots.", guide_ids: [], show_me: "", unknown: false, unknown_reason: "", prefill: emptyPrefill, ...over });

Deno.test("English and Hebrew have the same guides", () => {
  assertEquals(guideIdsFor("he").sort(), [...ids].sort());
  assert(ids.includes("new_shoot"));
});

Deno.test("the system prompt carries every guide and the read-only rule", () => {
  const prompt = buildSystemPrompt("en");
  for (const id of ids) assert(prompt.includes(`<guide id="${id}">`), id);
  assert(prompt.includes("You can only read and explain"));
  assert(buildSystemPrompt("he").includes("Hebrew"));
});

Deno.test("the question is wrapped, the page is only a path", () => {
  assertEquals(buildUserContent("Hi", "/admin/projects"), "The person is on the page /admin/projects.\n<question>\nHi\n</question>");
  assertEquals(buildUserContent("Hi", null), "<question>\nHi\n</question>");
});

Deno.test("the schema only allows known guides", () => {
  const schema = replyJsonSchema(ids) as { properties: { show_me: { enum: string[] } } };
  assertEquals(schema.properties.show_me.enum, ["", ...ids]);
});

Deno.test("requests: routes must be plain paths, questions are bounded", () => {
  assert(requestSchema.safeParse({ question: "How?", route: "/admin/projects" }).success);
  assert(!requestSchema.safeParse({ question: "How?", route: "javascript:alert(1)" }).success);
  assert(!requestSchema.safeParse({ question: "" }).success);
  assert(!requestSchema.safeParse({ question: "x".repeat(1001) }).success);
  assertEquals(requestSchema.parse({ question: "Hi" }).language, "en");
});

Deno.test("unknown guide ids and a bad tour are dropped", () => {
  const r = parseReply(reply({ guide_ids: ["new_shoot", "made_up", "new_shoot"], show_me: "made_up" }), ids);
  assertEquals(r?.guideIds, ["new_shoot"]);
  assertEquals(r?.showMe, null);
});

Deno.test("a new shoot prefill keeps only well-formed values", () => {
  const r = parseReply(reply({
    show_me: "new_shoot",
    prefill: { ...emptyPrefill, kind: "new_shoot", client_name: "Dana", client_email: "not an email", date: "2026-12-05", time: "", package_name: "Family" },
  }), ids);
  assertEquals(r?.showMe, "new_shoot");
  assertEquals(r?.prefill, {
    kind: "new_shoot", clientName: "Dana", clientEmail: undefined, clientPhone: undefined,
    packageName: "Family", startsAt: "2026-12-05T10:00", location: undefined,
  });
});

Deno.test("a package prefill needs a number for the price", () => {
  const r = parseReply(reply({ prefill: { ...emptyPrefill, kind: "package", name: "Mini", price: "₪500", duration_hours: "1.5" } }), ids);
  assertEquals(r?.prefill, { kind: "package", name: "Mini", price: undefined, durationHours: "1.5" });
});

Deno.test("unknown answers carry their reason and nothing to act on", () => {
  const gap = parseReply(reply({ unknown: true, unknown_reason: "missing_guide", guide_ids: ["quotes"], show_me: "quotes" }), ids);
  assertEquals(gap?.unknownReason, "missing_guide");
  assertEquals(gap?.guideIds, []);
  assertEquals(gap?.showMe, null);
  const off = parseReply(reply({ unknown: true, unknown_reason: "off_topic" }), ids);
  assertEquals(off?.unknownReason, "off_topic");
  // unknown without a reason counts as a missing guide, so it is not silently lost
  assertEquals(parseReply(reply({ unknown: true }), ids)?.unknownReason, "missing_guide");
  assertEquals(parseReply(reply({}), ids)?.unknownReason, null);
});

Deno.test("unusable model output gives null", () => {
  assertEquals(parseReply("not json", ids), null);
  assertEquals(parseReply(JSON.stringify({ answer: "" }), ids), null);
});

Deno.test("the day starts at midnight UTC", () => {
  assertEquals(startOfUtcDay(new Date("2026-11-24T19:30:00Z")), "2026-11-24T00:00:00.000Z");
});
