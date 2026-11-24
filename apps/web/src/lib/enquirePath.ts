/** The enquiry form with this package filled in (price on request, or not bookable online). */
export function enquirePath(offeringId: string): string {
  return `/inquire?package=${encodeURIComponent(offeringId)}`;
}
