/**
 * The contract PDF renders in both languages, embeds the Hebrew-capable font,
 * paginates long wording and survives an unusable logo. Visual verification of
 * the Hebrew (RTL order, shaped glyphs) was done by rasterising the output
 * with pdftoppm — see the PR for the images; these tests pin the mechanics.
 */
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@^1";
import { PDFDict, PDFDocument, PDFName } from "npm:pdf-lib@1.17.1";
import { type ContractPdfInput, formatSignedAt, renderContractPdf } from "./render.ts";

// 1×1 transparent PNG.
const PNG_1PX = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

function input(language: "he" | "en", overrides: Partial<ContractPdfInput> = {}): ContractPdfInput {
  const he = language === "he";
  return {
    language,
    business: { name: he ? "סטודיו אור" : "Lumen & Light", logo: null },
    title: he ? "הסכם צילום" : "Photography agreement",
    templateVersion: 3,
    wording: he
      ? "1. הצדדים: בין סטודיו אור (\"הצלם\") לבין דנה כהן.\n2. מועד הצילום: 24 בנובמבר 2026 בשעה 10:00.\n\nהחתימה מהווה הסכמה."
      : "1. Parties: Lumen & Light and Dana Cohen.\n2. Shoot date: 24 November 2026 at 10:00.\n\nSigning confirms acceptance.",
    details: {
      clientName: he ? "דנה כהן" : "Dana Cohen",
      shootDate: he ? "יום שלישי, 24 בנובמבר 2026" : "Tuesday, 24 November 2026",
      packageName: he ? "חבילת משפחה" : "Family session",
      location: he ? "תל אביב" : "Tel Aviv",
      price: he ? "‏1,250.00 ₪" : "₪1,250.00",
    },
    signature: {
      typedName: he ? "דנה כהן" : "Dana Cohen",
      signedAt: "2026-10-30T10:15:42.000Z",
      signerEmail: "dana@example.com",
      evidenceId: "4f0c1e6e-2f1b-4d4e-9a4c-8a7e2b6e7c11",
      consentVersionHash: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    },
    ...overrides,
  };
}

/** Objects are written in compressed object streams, so look at the parsed document, not the bytes. */
async function inspect(bytes: Uint8Array) {
  assertEquals(new TextDecoder().decode(bytes.subarray(0, 5)), "%PDF-");
  const doc = await PDFDocument.load(bytes);
  const fonts: string[] = [];
  let images = 0;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    const baseFont = obj.get(PDFName.of("BaseFont"));
    if (baseFont) fonts.push(baseFont.toString());
    if (obj.get(PDFName.of("Subtype"))?.toString() === "/Image") images++;
  }
  const lang = doc.catalog.get(PDFName.of("Lang"))?.toString() ?? null;
  return { doc, fonts: [...new Set(fonts)], images, lang };
}

Deno.test("renders an English contract: one page, Alef embedded, metadata set", async () => {
  const bytes = await renderContractPdf(input("en"));
  const { doc, fonts, lang } = await inspect(bytes);
  assertEquals(doc.getPageCount(), 1);
  assert(fonts.every((f) => f.startsWith("/Alef-")), `embedded fonts: ${fonts.join(", ")}`);
  assertEquals(fonts.length, 2); // regular + bold, nothing else
  assertEquals(doc.getTitle(), "Photography agreement — Lumen & Light");
  assertEquals(lang, "(en)");
});

Deno.test("renders a Hebrew contract with the same embedded font (no fallback to Latin-only fonts)", async () => {
  const bytes = await renderContractPdf(input("he"));
  const { doc, fonts, lang } = await inspect(bytes);
  assertEquals(doc.getPageCount(), 1);
  assert(fonts.every((f) => f.startsWith("/Alef-")), `embedded fonts: ${fonts.join(", ")}`);
  assert(!fonts.some((f) => /Helvetica|Times|Courier/.test(f)));
  assertEquals(lang, "(he)");
});

Deno.test("long wording paginates with a footer on every page", async () => {
  const paragraph = "סעיף ארוך מאוד שחוזר על עצמו כדי למלא את העמוד בטקסט בעברית, כולל מספרים כמו 1,250 ₪ ומילים באנגלית like this. ";
  const bytes = await renderContractPdf(input("he", { wording: Array.from({ length: 60 }, () => paragraph).join("\n") }));
  const { doc } = await inspect(bytes);
  assert(doc.getPageCount() >= 3, `expected 3+ pages, got ${doc.getPageCount()}`);
});

Deno.test("embeds a PNG logo, and ignores a logo it cannot decode", async () => {
  const withLogo = await renderContractPdf(input("en", { business: { name: "Lumen & Light", logo: { bytes: PNG_1PX, mimeType: "image/png" } } }));
  assertEquals((await inspect(withLogo)).images, 1);

  const broken = await renderContractPdf(
    input("en", { business: { name: "Lumen & Light", logo: { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" } } }),
  );
  const { doc } = await inspect(broken);
  assertEquals(doc.getPageCount(), 1);
});

Deno.test("formatSignedAt renders in Asia/Jerusalem in the tenant language", () => {
  // 10:15 UTC on 2026-10-30 is 12:15 Israel standard time (clocks went back on 25 Oct).
  assertMatch(formatSignedAt("2026-10-30T10:15:42.000Z", "en"), /30 October 2026 at 12:15:42 \(Israel time\)/);
  assertMatch(formatSignedAt("2026-10-30T10:15:42.000Z", "he"), /2026.*12:15:42.*\(שעון ישראל\)/);
});
