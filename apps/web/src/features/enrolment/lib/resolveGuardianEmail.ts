const GUARDIAN_ROLES = new Set(['parent', 'guardian']);

interface GuardianEmailSource {
  person?: { email?: string | null };
  family?: { contact_email?: string | null };
  members?: Array<{ role: string; email?: string | null }>;
}

/** Prefer family contact email, then guardian member, then student email. */
export function resolveGuardianEmail(source: GuardianEmailSource): string | null {
  if (source.family?.contact_email?.trim()) {
    return source.family.contact_email.trim();
  }

  const guardian = source.members?.find((m) => GUARDIAN_ROLES.has(m.role));
  if (guardian?.email?.trim()) {
    return guardian.email.trim();
  }

  if (source.person?.email?.trim()) {
    return source.person.email.trim();
  }

  return null;
}
