/**
 * Line layout for the signed-contract PDF: paragraph direction detection,
 * greedy word wrapping on measured widths, then Unicode bidi reordering of
 * each wrapped line into visual order (with bracket mirroring).
 *
 * Wrapping happens in logical order and reordering per line, as UAX #9
 * requires — reordering the whole paragraph first would put the words of a
 * wrapped Hebrew sentence on the wrong lines.
 *
 * Pure apart from bidi-js, so the behaviour is unit-testable without a PDF.
 */
import { getBidi } from "./bidi.ts";

export type Direction = "ltr" | "rtl";

export interface VisualLine {
  /** Characters in visual (left-to-right drawing) order. Empty for a blank line. */
  text: string;
  width: number;
  /** Direction of the paragraph the line belongs to — decides its alignment. */
  direction: Direction;
}

export type Measure = (text: string) => number;

/** Zero-width bidi controls: the algorithm has consumed them; the font has no glyphs for them. */
const BIDI_CONTROLS = /[​-‏‪-‮⁦-⁩﻿]/g;
/** Hebrew, Arabic, Syriac, Thaana, N'Ko and the Hebrew/Arabic presentation forms. */
const RTL_STRONG = /[֐-ࣿיִ-﷿ﹰ-﻿]/u;
const ANY_LETTER = /\p{L}/u;
/** Outside the BMP: bidi-js indexes by UTF-16 code unit and the font has no glyphs there. */
const ASTRAL = /[\u{10000}-\u{10FFFF}]/gu;

/** Direction of the first strong character; `fallback` when there is none (numbers, punctuation). */
export function detectDirection(text: string, fallback: Direction): Direction {
  const letter = text.match(ANY_LETTER);
  if (!letter) return fallback;
  return RTL_STRONG.test(letter[0]) ? "rtl" : "ltr";
}

/** Normalise text the renderer cannot draw: astral characters, stray CRs, tabs. */
export function sanitizeForFont(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").replace(ASTRAL, "?");
}

/**
 * Reorder `text[start, end)` (logical order) into visual order for one line,
 * mirroring brackets that fall in right-to-left runs.
 */
export function reorderLine(text: string, direction: Direction, start = 0, end = text.length): string {
  if (end <= start) return "";
  const bidi = getBidi();
  const levels = bidi.getEmbeddingLevels(text, direction);
  const chars = text.split("");
  for (const [index, mirrored] of bidi.getMirroredCharactersMap(text, levels.levels, start, end - 1)) {
    chars[index] = mirrored;
  }
  for (const [from, to] of bidi.getReorderSegments(text, levels, start, end - 1)) {
    let a = from, b = to;
    while (a < b) {
      const tmp = chars[a];
      chars[a] = chars[b];
      chars[b] = tmp;
      a++;
      b--;
    }
  }
  return chars.slice(start, end).join("").replace(BIDI_CONTROLS, "");
}

/**
 * fontkit (which pdf-lib uses to encode text) reverses the glyphs of any string
 * whose first non-common character belongs to a right-to-left script, so a
 * visually ordered line handed to pdf-lib in one piece comes out mirrored.
 * Split a visual line into runs: right-to-left-script runs are handed back in
 * logical order (fontkit's reversal then produces the visual order again) and
 * everything else is passed as is. Draw the runs left to right.
 */
export function splitForFontkit(visual: string): string[] {
  const runs: string[] = [];
  let current = "";
  let currentRtl = false;
  for (const ch of visual) {
    const rtl = RTL_STRONG.test(ch);
    if (current && rtl !== currentRtl) {
      runs.push(currentRtl ? [...current].reverse().join("") : current);
      current = "";
    }
    current += ch;
    currentRtl = rtl;
  }
  if (current) runs.push(currentRtl ? [...current].reverse().join("") : current);
  return runs;
}

/** One-line value (label, name, date): reorder without wrapping. */
export function visualText(text: string, fallback: Direction): { text: string; direction: Direction } {
  const clean = sanitizeForFont(text).replace(/\n/g, " ");
  const direction = detectDirection(clean, fallback);
  return { text: reorderLine(clean, direction), direction };
}

interface Range {
  start: number;
  end: number;
}

/** Break one run that is wider than the line by characters. */
function splitByCharacters(text: string, range: Range, measure: Measure, maxWidth: number): Range[] {
  const out: Range[] = [];
  let start = range.start;
  while (start < range.end) {
    let end = start + 1;
    while (end < range.end && measure(text.slice(start, end + 1)) <= maxWidth) end++;
    out.push({ start, end });
    start = end;
  }
  return out;
}

/** Greedy word wrap of one paragraph (no newlines) into logical ranges. */
export function wrapRanges(text: string, measure: Measure, maxWidth: number): Range[] {
  const words: Range[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) words.push({ start: m.index, end: m.index + m[0].length });
  if (words.length === 0) return [];

  const lines: Range[] = [];
  let current: Range = { ...words[0] };
  for (const word of words.slice(1)) {
    if (measure(text.slice(current.start, word.end)) <= maxWidth) {
      current.end = word.end;
    } else {
      lines.push(current);
      current = { ...word };
    }
  }
  lines.push(current);

  return lines.flatMap((line) =>
    measure(text.slice(line.start, line.end)) > maxWidth ? splitByCharacters(text, line, measure, maxWidth) : [line]
  );
}

/** Lay out one paragraph in the given direction: wrap, then reorder each line. */
export function layoutParagraph(
  paragraph: string,
  direction: Direction,
  measure: Measure,
  maxWidth: number,
): VisualLine[] {
  const ranges = wrapRanges(paragraph, measure, maxWidth);
  if (ranges.length === 0) return [{ text: "", width: 0, direction }];
  return ranges.map((range) => {
    const text = reorderLine(paragraph, direction, range.start, range.end);
    return { text, width: measure(text), direction };
  });
}

/**
 * Lay out multi-paragraph text. Each paragraph takes the direction of its first
 * strong character (a Hebrew clause inside an English contract stays
 * right-to-left), falling back to the document direction. Blank lines are kept
 * as empty visual lines.
 */
export function layoutText(text: string, fallback: Direction, measure: Measure, maxWidth: number): VisualLine[] {
  return sanitizeForFont(text)
    .split("\n")
    .flatMap((paragraph) => layoutParagraph(paragraph, detectDirection(paragraph, fallback), measure, maxWidth));
}
