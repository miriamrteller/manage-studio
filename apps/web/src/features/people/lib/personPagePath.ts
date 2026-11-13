/** A person's own page: everything about them, with links to each shoot, class, booking and payment. */
export function personPagePath(personId: string): string {
  return `/admin/people/${personId}`;
}
