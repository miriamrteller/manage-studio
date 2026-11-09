/**
 * Spam check shared by crm-lead-capture and crm-lead-ingest.
 * Run: cd supabase/functions && deno test crm-lead-capture/spam.test.ts
 * Examples are made up in the same shape as spam seen on the live forms.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assessLeadSpam,
  filledTooFast,
  isGibberishWord,
  MIN_FILL_MS,
} from "../_shared/crm-contract/lead-spam.ts";

const spam = (name: string, message = "", email = "someone@example.com") =>
  assessLeadSpam({ name, email, message });

Deno.test("letters and digits glued together, in the name or the message", () => {
  const r = spam("QWERTYZ4417702ZXCVBNM", "PLMOKNIJ4417702UHBYGV");
  assert(r.spam);
  assert(r.reasons.includes("name_digits"));
  assert(r.reasons.includes("letters_digits_mix"));
  assert(spam("Dana Cohen", "ABCDEF8812345GHIJKL").spam);
});

Deno.test("keyboard-mash message, even with a normal-looking name", () => {
  const r = spam("RobertGlaxy", "Hkdjwhfiuwehfjwoqpfkweh qowiejfwkdhfuiwqoeiwj qpwoeifjwkdjfhwuqiw example.com");
  assertEquals(r.reasons, ["gibberish_message"]);
  assert(isGibberishWord("ifwiqdjwrhwijwijwirhwu"));
});

Deno.test("one long jumbled word as a name", () => {
  assert(spam("Xqwjfhwkdjqwpfjw").reasons.includes("gibberish_name"));
  assert(spam("ZXCVBNMASDFGHJKLQW").spam);
});

Deno.test("a sender that imitates OpalSwift, and the 'get listed on Google' pitch", () => {
  assert(spam("Pat Smith", "Hello", "domains@search-opalswift.com").reasons.includes("lookalike_email"));
  assert(
    spam("Pat Smith", "Dear Sir/Madam\n\nList your site in Google’s Search Index today!").reasons
      .includes("seo_pitch"),
  );
  assertEquals(spam("Pat Smith", "Hello", "owner@opalswift.com").spam, false);
});

Deno.test("links or emails in the name", () => {
  assert(spam("Win now www.example.ru").reasons.includes("name_link"));
  assert(spam("me@example.com").reasons.includes("name_link"));
});

Deno.test("real people pass: English, Hebrew, unusual names, long words", () => {
  const people: Array<[string, string]> = [
    ["Krzysztof Przybylski", "Hi, my daughter (7) wants to start ballet in September. Is there a beginners class?"],
    ["Tzvi Kowalczyk", "Looking for wedding photography on 14/03/2027 in Herzliya, about 120 guests."],
    ["Yitzchak Schwarzschild", "Internationalisation and responsibilities: can you handle registration for 3 groups?"],
    ["שרה לוי", "שלום, אשמח לפרטים על חוגי בלט לגיל 5. תודה!"],
    ["Mary-Jane O'Neil", ""],
    ["Nguyen Thi", "Call me on 052-1234567 after 5pm please"],
    ["DeAngelo McDonald", "My business is a dance school, the biggest hassle is chasing payments."],
    ["Ekaterina", "Do you do evening classes? Order ref 2026-118 from my last visit."],
  ];
  for (const [name, message] of people) {
    const r = spam(name, message);
    assertEquals(r.spam, false, `${name}: ${r.reasons.join(", ")}`);
  }
});

Deno.test("time trap: too fast is a script; missing or slow passes", () => {
  assert(filledTooFast(400));
  assert(filledTooFast(MIN_FILL_MS - 1));
  assertEquals(filledTooFast(MIN_FILL_MS), false);
  assertEquals(filledTooFast(60_000), false);
  assertEquals(filledTooFast(null), false);
  assertEquals(filledTooFast(undefined), false);
  assertEquals(filledTooFast(Number.NaN), false);
});

Deno.test("forwarded lead emails: message shape not judged, the pitch still is", () => {
  const body = "Booking ref ABCD12345EFGH\n--\nSent from my phone xqwjfhwkdjqwpfjw zxqwjfhwkdjqwpf";
  assertEquals(assessLeadSpam({ name: "Dana Cohen", message: body, checkMessageShape: false }).spam, false);
  assert(assessLeadSpam({ name: null, message: "We offer SEO services", checkMessageShape: false }).spam);
});

Deno.test("links in the message are not read as glued digits", () => {
  assertEquals(spam("Dana Cohen", "See https://example.com/abcd12345efgh please").spam, false);
});
