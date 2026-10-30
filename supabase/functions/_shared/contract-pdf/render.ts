/**
 * Signed shoot-contract PDF (Thread G).
 *
 * pdf-lib + fontkit draw glyphs exactly in the order given and know nothing
 * about bidi, so Hebrew is reordered line by line in text-layout.ts before it
 * is drawn. The embedded font is Alef (SIL OFL), which covers Hebrew and Latin
 * in one face, so a contract that mixes the two never falls back to a font
 * without the glyphs. Everything is embedded; the function has no file system
 * and no network dependency at render time.
 */
import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, rgb } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import { ALEF_BOLD_BASE64, ALEF_REGULAR_BASE64 } from "./alef-font-data.ts";
import {
  type Direction,
  layoutParagraph,
  layoutText,
  reorderLine,
  sanitizeForFont,
  splitForFontkit,
  type VisualLine,
  visualText,
} from "./text-layout.ts";

export type ContractPdfLanguage = "he" | "en";

export interface ContractPdfLogo {
  bytes: Uint8Array;
  /** image/png or image/jpeg; anything else is ignored. */
  mimeType: string;
}

export interface ContractPdfInput {
  language: ContractPdfLanguage;
  business: { name: string; logo?: ContractPdfLogo | null };
  /** Contract title (the consent template name). */
  title: string;
  templateVersion: number;
  /** The exact rendered wording that was signed (waiver_evidence.wording_snapshot). */
  wording: string;
  details: {
    clientName: string;
    shootDate: string;
    packageName: string;
    location: string;
    price: string;
  };
  signature: {
    typedName: string;
    /** ISO-8601 instant; rendered in Asia/Jerusalem. */
    signedAt: string;
    signerEmail: string | null;
    evidenceId: string;
    consentVersionHash: string;
  };
}

const STRINGS: Record<ContractPdfLanguage, Record<string, string>> = {
  en: {
    details: "Shoot details",
    client: "Client",
    shoot_date: "Shoot date",
    package: "Package",
    location: "Location",
    price: "Price",
    signature: "Electronic signature",
    signed_by: "Signed by (typed name)",
    signed_at: "Signed at",
    signer_email: "Signer email",
    evidence_id: "Evidence ID",
    wording_hash: "Wording SHA-256",
    version: "Contract version",
    method: "Method",
    method_value: "Typed name and confirmation checkbox, recorded by the server",
    note: "This document reproduces the wording the signer read and accepted. The signed record identified by the evidence ID above is the authoritative copy; the hash lets anyone confirm this wording is unchanged.",
    page: "Page {n} of {total}",
    tz: "Israel time",
  },
  he: {
    details: "פרטי הצילום",
    client: "לקוח/ה",
    shoot_date: "תאריך הצילום",
    package: "חבילה",
    location: "מיקום",
    price: "מחיר",
    signature: "חתימה אלקטרונית",
    signed_by: "נחתם על ידי (שם מוקלד)",
    signed_at: "מועד החתימה",
    signer_email: "דוא\"ל החותם/ת",
    evidence_id: "מזהה ראיה",
    wording_hash: "תקציר SHA-256 של הנוסח",
    version: "גרסת החוזה",
    method: "אופן החתימה",
    method_value: "הקלדת שם ותיבת אישור, נרשמו בשרת",
    note: "מסמך זה משחזר את הנוסח שהחותם/ת קרא/ה ואישר/ה. הרשומה החתומה שמזוהה במזהה הראיה לעיל היא העותק המחייב; ה-hash מאפשר לכל אחד לוודא שהנוסח לא השתנה.",
    page: "עמוד {n} מתוך {total}",
    tz: "שעון ישראל",
  },
};

const PAGE = { width: 595.28, height: 841.89 } as const; // A4
const MARGIN = 50;
const CONTENT_WIDTH = PAGE.width - 2 * MARGIN;
const BODY_SIZE = 10.5;
const BODY_LEADING = 15.5;
const FOOTER_SPACE = 40;
const INK = rgb(0.12, 0.12, 0.14);
const MUTED = rgb(0.42, 0.42, 0.47);
const RULE = rgb(0.8, 0.8, 0.84);

/** Draw a visually ordered string starting at x (its left edge). See splitForFontkit. */
function drawVisual(
  page: PDFPage,
  visual: string,
  opts: { x: number; y: number; size: number; font: PDFFont; color: ReturnType<typeof rgb> },
): void {
  let x = opts.x;
  for (const run of splitForFontkit(visual)) {
    page.drawText(run, { x, y: opts.y, size: opts.size, font: opts.font, color: opts.color });
    x += opts.font.widthOfTextAtSize(run, opts.size);
  }
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function formatSignedAt(iso: string, language: ContractPdfLanguage): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const formatted = new Intl.DateTimeFormat(language === "he" ? "he-IL" : "en-GB", {
    timeZone: "Asia/Jerusalem",
    dateStyle: "long",
    timeStyle: "medium",
  }).format(date);
  return `${formatted} (${STRINGS[language].tz})`;
}

/** Cursor-based page writer: moves down the page, opening a new one when the content would not fit. */
class Writer {
  readonly pages: PDFPage[] = [];
  private page!: PDFPage;
  y = 0;

  constructor(readonly doc: PDFDocument, readonly direction: Direction) {
    this.newPage();
  }

  newPage(): void {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.pages.push(this.page);
    this.y = PAGE.height - MARGIN;
  }

  ensure(height: number): void {
    if (this.y - height < MARGIN + FOOTER_SPACE) this.newPage();
  }

  /** Draw one visual line aligned by its paragraph direction (right edge for RTL). */
  line(line: VisualLine, font: PDFFont, size: number, leading: number, color = INK, indent = 0): void {
    this.ensure(leading);
    if (line.text) {
      const x = line.direction === "rtl" ? PAGE.width - MARGIN - indent - line.width : MARGIN + indent;
      drawVisual(this.page, line.text, { x, y: this.y - size, size, font, color });
    }
    this.y -= leading;
  }

  paragraphs(text: string, font: PDFFont, size: number, leading: number, color = INK, indent = 0): void {
    const measure = (s: string) => font.widthOfTextAtSize(s, size);
    for (const line of layoutText(text, this.direction, measure, CONTENT_WIDTH - indent)) {
      this.line(line, font, size, leading, color, indent);
    }
  }

  /**
   * "Label: value" row in the document direction (labels are in the document
   * language, so direction is not detected from the value). The label is bold
   * when the row fits on one line; a wrapped row falls back to regular weight.
   */
  row(label: string, value: string, fonts: { regular: PDFFont; bold: PDFFont }, size = BODY_SIZE): void {
    const text = sanitizeForFont(`${label}: ${value}`).replace(/\n/g, " ");
    const measure = (s: string) => fonts.regular.widthOfTextAtSize(s, size);
    const lines = layoutParagraph(text, this.direction, measure, CONTENT_WIDTH);
    if (lines.length === 1) {
      const labelText = reorderLine(`${label}:`, this.direction);
      const valueText = reorderLine(sanitizeForFont(value).replace(/\n/g, " "), this.direction);
      const labelWidth = fonts.bold.widthOfTextAtSize(labelText, size);
      const gap = measure(" ");
      const valueWidth = measure(valueText);
      this.ensure(BODY_LEADING);
      const y = this.y - size;
      if (this.direction === "rtl") {
        const right = PAGE.width - MARGIN;
        drawVisual(this.page, labelText, { x: right - labelWidth, y, size, font: fonts.bold, color: INK });
        drawVisual(this.page, valueText, { x: right - labelWidth - gap - valueWidth, y, size, font: fonts.regular, color: INK });
      } else {
        drawVisual(this.page, labelText, { x: MARGIN, y, size, font: fonts.bold, color: INK });
        drawVisual(this.page, valueText, { x: MARGIN + labelWidth + gap, y, size, font: fonts.regular, color: INK });
      }
      this.y -= BODY_LEADING;
      return;
    }
    for (const line of lines) this.line(line, fonts.regular, size, BODY_LEADING);
  }

  rule(): void {
    this.ensure(14);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y - 6 },
      end: { x: PAGE.width - MARGIN, y: this.y - 6 },
      thickness: 0.6,
      color: RULE,
    });
    this.y -= 14;
  }

  space(height: number): void {
    this.y -= height;
  }

  current(): PDFPage {
    return this.page;
  }
}

async function embedLogo(doc: PDFDocument, logo: ContractPdfLogo | null | undefined): Promise<PDFImage | null> {
  if (!logo || logo.bytes.length === 0) return null;
  try {
    const type = logo.mimeType.toLowerCase();
    if (type === "image/png") return await doc.embedPng(logo.bytes);
    if (type === "image/jpeg" || type === "image/jpg") return await doc.embedJpg(logo.bytes);
  } catch (error) {
    console.warn("[contract-pdf] logo could not be embedded, continuing without it:", error);
  }
  return null;
}

export async function renderContractPdf(input: ContractPdfInput): Promise<Uint8Array> {
  const language = input.language === "he" ? "he" : "en";
  const direction: Direction = language === "he" ? "rtl" : "ltr";
  const s = STRINGS[language];

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${input.title} — ${input.business.name}`);
  doc.setSubject(`${input.details.clientName}, ${input.details.shootDate}`);
  doc.setProducer("manage-studio contract-pdf");
  doc.setCreationDate(new Date(input.signature.signedAt));
  doc.setLanguage(language);

  const fonts = {
    regular: await doc.embedFont(decodeBase64(ALEF_REGULAR_BASE64), { subset: true }),
    bold: await doc.embedFont(decodeBase64(ALEF_BOLD_BASE64), { subset: true }),
  };
  const logo = await embedLogo(doc, input.business.logo);
  const w = new Writer(doc, direction);

  // --- Header: logo + business name on the paragraph-start side ---
  const headerHeight = 40;
  let textStart = direction === "rtl" ? PAGE.width - MARGIN : MARGIN;
  if (logo) {
    const scale = Math.min(headerHeight / logo.height, 160 / logo.width, 1);
    const lw = logo.width * scale;
    const lh = logo.height * scale;
    const x = direction === "rtl" ? PAGE.width - MARGIN - lw : MARGIN;
    w.current().drawImage(logo, { x, y: w.y - lh, width: lw, height: lh });
    textStart = direction === "rtl" ? x - 12 : x + lw + 12;
  }
  const nameVisual = visualText(input.business.name, direction);
  const nameSize = 14;
  const nameWidth = fonts.bold.widthOfTextAtSize(nameVisual.text, nameSize);
  drawVisual(w.current(), nameVisual.text, {
    x: direction === "rtl" ? textStart - nameWidth : textStart,
    y: w.y - (logo ? headerHeight / 2 + nameSize / 2 - 2 : nameSize),
    size: nameSize,
    font: fonts.bold,
    color: INK,
  });
  w.space(logo ? headerHeight + 6 : nameSize + 8);
  w.rule();
  w.space(6);

  // --- Title ---
  w.paragraphs(input.title, fonts.bold, 18, 24);
  w.space(8);

  // --- Details ---
  w.paragraphs(s.details, fonts.bold, 12, 18, MUTED);
  w.row(s.client, input.details.clientName, fonts);
  w.row(s.shoot_date, input.details.shootDate, fonts);
  w.row(s.package, input.details.packageName, fonts);
  w.row(s.location, input.details.location, fonts);
  w.row(s.price, input.details.price, fonts);
  w.space(8);
  w.rule();
  w.space(6);

  // --- The signed wording, verbatim ---
  w.paragraphs(input.wording, fonts.regular, BODY_SIZE, BODY_LEADING);
  w.space(12);
  w.rule();
  w.space(6);

  // --- Signature block ---
  w.ensure(BODY_LEADING * 9);
  w.paragraphs(s.signature, fonts.bold, 12, 18, MUTED);
  w.row(s.signed_by, input.signature.typedName, fonts);
  w.row(s.signed_at, formatSignedAt(input.signature.signedAt, language), fonts);
  if (input.signature.signerEmail) w.row(s.signer_email, input.signature.signerEmail, fonts);
  w.row(s.method, s.method_value, fonts);
  w.row(s.version, String(input.templateVersion), fonts);
  w.row(s.evidence_id, input.signature.evidenceId, fonts);
  w.row(s.wording_hash, input.signature.consentVersionHash, fonts);
  w.space(6);
  w.paragraphs(s.note, fonts.regular, 8.5, 12, MUTED);

  // --- Footer on every page ---
  const total = w.pages.length;
  w.pages.forEach((page, index) => {
    const label = s.page.replace("{n}", String(index + 1)).replace("{total}", String(total));
    const left = visualText(`${input.business.name} · ${label}`, direction);
    const right = visualText(input.signature.evidenceId, "ltr");
    const size = 8;
    const leftWidth = fonts.regular.widthOfTextAtSize(left.text, size);
    const rightWidth = fonts.regular.widthOfTextAtSize(right.text, size);
    const y = MARGIN - 10;
    if (direction === "rtl") {
      drawVisual(page, left.text, { x: PAGE.width - MARGIN - leftWidth, y, size, font: fonts.regular, color: MUTED });
      drawVisual(page, right.text, { x: MARGIN, y, size, font: fonts.regular, color: MUTED });
    } else {
      drawVisual(page, left.text, { x: MARGIN, y, size, font: fonts.regular, color: MUTED });
      drawVisual(page, right.text, { x: PAGE.width - MARGIN - rightWidth, y, size, font: fonts.regular, color: MUTED });
    }
  });

  return await doc.save();
}
