/**
 * A package or session length in words people use: "5 hours", "1 hour 30 min",
 * "45 min"; in Hebrew "שעה", "שעתיים", "שעה וחצי", "5 שעות" (24 Nov 2026 audit:
 * "300 min" made people work out the hours themselves).
 */
export function formatDuration(totalMinutes: number, language: string): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return language.startsWith('he') ? hebrew(h, m) : english(h, m);
}

function english(h: number, m: number): string {
  const hours = h === 0 ? '' : h === 1 ? '1 hour' : `${h} hours`;
  if (!m) return hours || '0 min';
  return hours ? `${hours} ${m} min` : `${m} min`;
}

function hebrew(h: number, m: number): string {
  const hours = h === 0 ? '' : h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
  if (!m) return hours || '0 דק׳';
  if (!hours) return `${m} דק׳`;
  if (m === 30) return `${hours} וחצי`;
  return `${hours} ו-${m} דק׳`;
}
