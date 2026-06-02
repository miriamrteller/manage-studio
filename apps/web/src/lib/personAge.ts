/** Parse YYYY-MM-DD as a local calendar date (avoids UTC timezone drift). */
export function ageAt(dateOfBirth: string, reference = new Date()): number {
  const [y, m, d] = dateOfBirth.split('-').map(Number);
  if (!y || !m || !d) return NaN;

  let age = reference.getFullYear() - y;
  const refMonth = reference.getMonth() + 1;
  const refDay = reference.getDate();
  if (refMonth < m || (refMonth === m && refDay < d)) age--;
  return age;
}

export function personAgeLabel(dateOfBirth: string | null | undefined): string | null {
  if (!dateOfBirth) return null;
  const age = ageAt(dateOfBirth);
  return Number.isNaN(age) ? null : String(age);
}
