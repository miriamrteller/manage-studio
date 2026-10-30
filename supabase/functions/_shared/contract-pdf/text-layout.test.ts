/**
 * Line layout for the signed-contract PDF: direction detection, wrapping in
 * logical order, bidi reordering per line, and the fontkit run split that
 * stops pdf-lib's own RTL reversal from undoing the reordering.
 *
 * Run: deno test --allow-env --allow-read --allow-net _shared/contract-pdf
 */
import { assertEquals } from "jsr:@std/assert@^1";
import {
  detectDirection,
  layoutText,
  reorderLine,
  sanitizeForFont,
  splitForFontkit,
  visualText,
  wrapRanges,
} from "./text-layout.ts";

/** Monospace stand-in: one unit per character. */
const measure = (s: string) => s.length;
const rev = (s: string) => [...s].reverse().join("");

Deno.test("detectDirection: first strong character wins; fallback for neutrals", () => {
  assertEquals(detectDirection("שלום world", "ltr"), "rtl");
  assertEquals(detectDirection("Hello שלום", "rtl"), "ltr");
  assertEquals(detectDirection("1. שלום", "ltr"), "rtl");
  assertEquals(detectDirection("1,250.00 ₪", "rtl"), "rtl");
  assertEquals(detectDirection("", "ltr"), "ltr");
});

Deno.test("reorderLine: Hebrew words are reversed into visual order, numbers and Latin stay LTR", () => {
  // Visual (left to right): "world" sits on the LEFT of a Hebrew sentence that ends with it.
  assertEquals(reorderLine("שלום world", "rtl"), "world " + rev("שלום"));
  // A number inside Hebrew keeps its digit order.
  assertEquals(reorderLine("בנובמבר 2026", "rtl"), "2026 " + rev("בנובמבר"));
  // Pure Latin is untouched.
  assertEquals(reorderLine("Hello world", "ltr"), "Hello world");
});

Deno.test("reorderLine: brackets in RTL runs are mirrored so they still enclose their content", () => {
  // Logical: חבילה (Family) → visual LTR must show "(Family)" to the left of the reversed Hebrew.
  assertEquals(reorderLine("חבילה (Family)", "rtl"), "(Family) " + rev("חבילה"));
  // All-Hebrew brackets: logical "(הצלם)" → each bracket swaps with its mirror after reversal.
  assertEquals(reorderLine("בין (הצלם)", "rtl"), "(" + rev("הצלם") + ") " + rev("בין"));
});

Deno.test("reorderLine strips zero-width bidi controls after use (Intl's RLM in Hebrew prices)", () => {
  assertEquals(reorderLine("‏1,250.00 ₪", "rtl"), "₪ 1,250.00");
});

Deno.test("sanitizeForFont: tabs, CRLF and astral characters the font cannot draw", () => {
  assertEquals(sanitizeForFont("a\tb\r\nc 😀"), "a    b\nc ?");
});

Deno.test("wrapRanges: greedy on measured width, never splits a word that fits", () => {
  const text = "aaa bbb ccc dddddd";
  const ranges = wrapRanges(text, measure, 7);
  assertEquals(ranges.map((r) => text.slice(r.start, r.end)), ["aaa bbb", "ccc", "dddddd"]);
});

Deno.test("wrapRanges: a word wider than the line is broken by characters", () => {
  const text = "abcdefghij";
  const ranges = wrapRanges(text, measure, 4);
  assertEquals(ranges.map((r) => text.slice(r.start, r.end)), ["abcd", "efgh", "ij"]);
});

Deno.test("layoutText: wraps before reordering, so a Hebrew sentence keeps its words on the right lines", () => {
  const text = "אחת שתיים שלוש ארבע";
  const lines = layoutText(text, "ltr", measure, 9);
  assertEquals(lines.map((l) => l.direction), ["rtl", "rtl"]);
  assertEquals(lines.map((l) => l.text), [rev("אחת שתיים"), rev("שלוש ארבע")]);
});

Deno.test("layoutText: blank lines survive and each paragraph takes its own direction", () => {
  const lines = layoutText("Hello\n\nשלום", "ltr", measure, 50);
  assertEquals(lines.map((l) => [l.text, l.direction]), [["Hello", "ltr"], ["", "ltr"], [rev("שלום"), "rtl"]]);
});

Deno.test("splitForFontkit: Hebrew runs go back to logical order, everything else is passed as is", () => {
  // UAX #9 W7: a number after Latin joins the Latin run, so "world 2026" stays one LTR run.
  const visual = reorderLine("שלום world 2026", "rtl");
  assertEquals(visual, "world 2026 " + rev("שלום"));
  assertEquals(splitForFontkit(visual), ["world 2026 ", "שלום"]);
  assertEquals(splitForFontkit("plain"), ["plain"]);
  assertEquals(splitForFontkit(""), []);
});

Deno.test("visualText: single-line value", () => {
  assertEquals(visualText("Dana Cohen", "rtl"), { text: "Dana Cohen", direction: "ltr" });
  assertEquals(visualText("דנה\nכהן", "ltr"), { text: rev("דנה כהן"), direction: "rtl" });
});
