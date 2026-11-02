// Tests for scripts/build-legal.mjs (docs/legal → public legal pages).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { convert, build, PAGES, PUBLISHED } from "../scripts/build-legal.mjs";

const sample = `> **Draft, not legal advice. Have an Israeli lawyer review before publishing.**
> Hebrew version: [x.he.md](x.he.md).

# Title

Last updated: [[DATE]] · Version [[VERSION]]

Write to [[SUPPORT EMAIL]] or [[LEGAL NOTICES EMAIL]]. Name: [[OPALSWIFT LEGAL NAME]].
See the [privacy policy](04-opalswift-privacy-policy.en.md) and the [DPA](02-dpa.en.md).
Review date: [[DATE]].

---

### Sources relied on
- For the lawyer: secret note
`;

test("drops the draft header and the drafting notes", () => {
  const { html } = convert(sample, "en");
  assert.ok(!html.includes("Draft, not legal advice"));
  assert.ok(!html.includes("Sources relied on"));
  assert.ok(!html.includes("secret note"));
  assert.match(html, /<h1>Title<\/h1>/);
});

test("fills the contact email and the Last updated date only", () => {
  const { html, todo } = convert(sample, "en");
  assert.ok(html.includes(`Last updated: ${PUBLISHED.en}`));
  assert.equal((html.match(/mailto:hello@opalswift\.com/g) || []).length, 2);
  // The second [[DATE]] (not on the Last updated line) stays open.
  assert.deepEqual(todo, ["VERSION", "OPALSWIFT LEGAL NAME", "DATE"]);
  assert.equal((html.match(/<mark class="tbc"/g) || []).length, 3);
  assert.ok(!html.includes("[["));
});

test("links: published docs become site links, the rest plain text", () => {
  const { html } = convert(sample, "en");
  assert.ok(html.includes('<a href="/privacy">privacy policy</a>'));
  assert.ok(html.includes("the DPA."));
  assert.ok(!html.includes(".md"));
});

test("Hebrew: fills the Hebrew email placeholders and date", () => {
  const he = `# כותרת\n\nעדכון אחרון: [[תאריך]]\n\nכתבו ל-[[דוא"ל תמיכה]]. שם: [[השם המשפטי של OpalSwift]].\n`;
  const { html, todo } = convert(he, "he");
  assert.ok(html.includes(`עדכון אחרון: ${PUBLISHED.he}`));
  assert.ok(html.includes("mailto:hello@opalswift.com"));
  assert.deepEqual(todo, ["השם המשפטי של OpalSwift"]);
});

test("placeholder text is HTML-escaped", () => {
  const { html } = convert('A [[x <b>"y"</b>]] b\n', "en");
  assert.ok(html.includes("x &lt;b&gt;&quot;y&quot;&lt;/b&gt;"));
});

test("committed pages match docs/legal (run pnpm build:legal if this fails)", () => {
  const pages = build();
  for (const { slug } of PAGES) {
    const committed = readFileSync(new URL(`../public/${slug}.html`, import.meta.url), "utf8");
    assert.equal(committed, pages[slug].html, `public/${slug}.html is stale`);
  }
});

test("each page has both languages and no leftover markdown placeholders", () => {
  for (const { slug } of PAGES) {
    const html = build()[slug].html;
    assert.ok(html.includes('<article class="doc" lang="he" dir="rtl">'));
    assert.ok(html.includes('<article class="doc" lang="en" dir="ltr">'));
    assert.ok(!html.includes("[["), slug);
    assert.ok(!/For the lawyer|Sources relied on|לעורך/.test(html), slug);
  }
});
