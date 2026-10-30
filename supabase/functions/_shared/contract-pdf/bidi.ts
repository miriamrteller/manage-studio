/**
 * Typed wrapper around bidi-js (UAX #9 implementation, pure JS, no types
 * shipped). pdf-lib draws glyphs in the order it is given, so right-to-left
 * text has to be reordered into visual order before drawing — this is the
 * algorithm that does it.
 */
import bidiFactory from "npm:bidi-js@1.0.3";

export interface EmbeddingLevels {
  levels: Uint8Array;
  paragraphs: Array<{ start: number; end: number; level: number }>;
}

export interface BidiApi {
  getEmbeddingLevels(text: string, direction?: "ltr" | "rtl"): EmbeddingLevels;
  /** Segments [start, end] (inclusive, code-unit indices) to reverse in order. */
  getReorderSegments(text: string, levels: EmbeddingLevels, start?: number, end?: number): Array<[number, number]>;
  /**
   * Unlike the README, the implementation indexes its second argument directly,
   * so it takes the `levels` array, not the whole getEmbeddingLevels result.
   */
  getMirroredCharactersMap(text: string, levels: Uint8Array, start?: number, end?: number): Map<number, string>;
}

let instance: BidiApi | null = null;

export function getBidi(): BidiApi {
  if (!instance) instance = (bidiFactory as unknown as () => BidiApi)();
  return instance;
}
