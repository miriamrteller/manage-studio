/**
 * Enrolment confirmation email shells must render without React in Deno Edge.
 * Run: pnpm -C apps/web test enrolment-confirmation-email.test.ts
 */
import { describe, expect, it } from "vitest";
import { renderEnrolmentConfirmationHtml } from "../../../../supabase/functions/_shared/render-enrolment-confirmation-email.ts";

describe("renderEnrolmentConfirmationHtml", () => {
  it("renders confirmed enrolment HTML without React runtime errors", () => {
    const html = renderEnrolmentConfirmationHtml({
      language: "en",
      schoolName: "Creative Ballet Academy",
      recipientName: "Miriam",
      className: "Primary (Monthly)",
      classDetails: {
        day: "Tuesday",
        time: "17:00–17:45",
        startDate: "1 September 2026",
        teacher: "Coach Anna",
      },
      pendingWaiver: false,
      primaryColor: "#76335a",
      accentColor: "#e99ac4",
    });

    expect(html).toContain("Creative Ballet Academy");
    expect(html).toContain("Miriam");
    expect(html).toContain("Primary (Monthly)");
    expect(html).toContain("Tuesday");
    expect(html).not.toContain("{{SCHOOL_NAME}}");
  });

  it("renders pending waiver variant with sign link", () => {
    const html = renderEnrolmentConfirmationHtml({
      language: "en",
      schoolName: "Creative Ballet Academy",
      recipientName: "Miriam",
      className: "Primary (Monthly)",
      pendingWaiver: true,
      signUrl: "https://example.com/enrol/complete?wt=test",
      deadlineDate: new Date("2026-09-01").toISOString(),
      primaryColor: "#76335a",
      accentColor: "#e99ac4",
    });

    expect(html).toContain("Sign Your Waiver");
    expect(html).toContain("https://example.com/enrol/complete?wt=test");
  });
});
