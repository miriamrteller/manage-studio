/**
 * Unicode bidi isolates for email text that mixes Hebrew and English.
 *
 * A name or service typed in one script, dropped into a sentence in the other, can
 * pull the words around it out of order ("שלום Reuve and Miri," shows its comma in the
 * wrong place; "09:00–10:00" shows as "10:00–09:00" in a Hebrew line). Isolating the
 * inserted text keeps it as one block in the sentence. The marks are invisible and work
 * in any mail app, because the reader's own text layout honours them (no HTML needed).
 */
const FSI = "⁨"; // first strong isolate: direction from the text itself
const LRI = "⁦"; // left-to-right isolate
const PDI = "⁩"; // pop directional isolate

/** The text as one block, in its own direction. Empty stays empty. */
export function isolate(text: string): string {
  return text ? `${FSI}${text}${PDI}` : text;
}

/** Always left to right (times, ranges, numbers), even inside a Hebrew line. */
export function isolateLtr(text: string): string {
  return text ? `${LRI}${text}${PDI}` : text;
}
