/**
 * Enrolment confirmation email shells must render without React in Deno Edge.
 * Run: pnpm -C apps/web test enrolment-confirmation-email.test.ts
 */
import { describe, expect, it } from "vitest";
import { renderEnrolmentConfirmationHtml } from "../../../../supabase/functions/_shared/render-enrolment-confirmation-email.ts";

const paymentSummary = {
  amountFormatted: "₪350",
  paidOnFormatted: "Tuesday, 23 June 2026",
  paymentMethodLabel: "Visa ending in 4242",
};

describe("renderEnrolmentConfirmationHtml", () => {
  it("renders confirmed enrolment HTML with class and payment details", () => {
    const html = renderEnrolmentConfirmationHtml({
      language: "en",
      schoolName: "Creative Ballet Academy",
      recipientName: "Sarah",
      studentName: "Miriam",
      showStudentRow: true,
      className: "Primary (Monthly)",
      classDetails: {
        day: "Tuesday",
        time: "17:00–17:45",
        startDate: "1 September 2026",
        teacher: "Coach Anna",
      },
      paymentSummary,
      pendingWaiver: false,
      primaryColor: "#76335a",
      accentColor: "#e99ac4",
    });

    expect(html).toContain("Creative Ballet Academy");
    expect(html).toContain("Sarah");
    expect(html).toContain("Miriam");
    expect(html).toContain("Primary (Monthly)");
    expect(html).toContain("Tuesday");
    expect(html).toContain("₪350");
    expect(html).toContain("Visa ending in 4242");
    expect(html).toContain("Tax invoice");
    expect(html).toContain("separate message");
    expect(html).not.toContain("{{SCHOOL_NAME}}");
    expect(html).not.toContain("{{AMOUNT_PAID}}");
  });

  it("omits student row when showStudentRow is false", () => {
    const html = renderEnrolmentConfirmationHtml({
      language: "en",
      schoolName: "Creative Ballet Academy",
      recipientName: "Miriam",
      studentName: "Miriam",
      showStudentRow: false,
      className: "Primary (Monthly)",
      paymentSummary,
      pendingWaiver: false,
      primaryColor: "#76335a",
      accentColor: "#e99ac4",
    });

    expect(html).not.toContain("{{STUDENT_NAME}}");
    expect(html).toContain("Primary (Monthly)");
    expect(html).toContain("Hi Miriam");
    expect(html).toContain("Your enrollment in Primary (Monthly) is confirmed!");
    expect(html).toContain("Class details");
    expect(html).toContain("padding:28px 32px");
    expect(html).not.toMatch(/Student[\s\S]*Primary \(Monthly\)/);
  });

  it("renders pending waiver variant with sign link", () => {
    const html = renderEnrolmentConfirmationHtml({
      language: "en",
      schoolName: "Creative Ballet Academy",
      recipientName: "Miriam",
      studentName: "Miriam",
      showStudentRow: false,
      className: "Primary (Monthly)",
      paymentSummary,
      pendingWaiver: true,
      signUrl: "https://example.com/enrol/complete?wt=test",
      deadlineDate: new Date("2026-09-01").toISOString(),
      primaryColor: "#76335a",
      accentColor: "#e99ac4",
    });

    expect(html).toContain("Sign Your Waiver");
    expect(html).toContain("https://example.com/enrol/complete?wt=test");
  });

  it("renders location in HTML when provided", () => {
    const html = renderEnrolmentConfirmationHtml({
      language: "en",
      schoolName: "Creative Ballet Academy",
      recipientName: "Sarah",
      studentName: "Miriam",
      showStudentRow: true,
      className: "Primary (Monthly)",
      location: "Studio B, 12 Rothschild Blvd, Tel Aviv",
      classDetails: {
        day: "Tuesday",
        time: "17:00–17:45",
      },
      paymentSummary,
      pendingWaiver: false,
      primaryColor: "#76335a",
      accentColor: "#e99ac4",
    });

    expect(html).toContain("Location");
    expect(html).toContain("Studio B, 12 Rothschild Blvd, Tel Aviv");
    expect(html).not.toContain("{{LOCATION}}");
  });

  it("omits location row when not provided", () => {
    const html = renderEnrolmentConfirmationHtml({
      language: "en",
      schoolName: "Creative Ballet Academy",
      recipientName: "Sarah",
      studentName: "Miriam",
      showStudentRow: true,
      className: "Primary (Monthly)",
      paymentSummary,
      pendingWaiver: false,
      primaryColor: "#76335a",
      accentColor: "#e99ac4",
    });

    expect(html).not.toContain("{{LOCATION}}");
  });

  it("renders Hebrew tax invoice notice in he shell", () => {
    const html = renderEnrolmentConfirmationHtml({
      language: "he",
      schoolName: "Creative Ballet Academy",
      recipientName: "שרה",
      studentName: "מירiam",
      showStudentRow: true,
      className: "Primary (Monthly)",
      paymentSummary: {
        amountFormatted: "₪350",
        paidOnFormatted: "23 ביוני 2026",
        paymentMethodLabel: "Visa המסתיים ב-4242",
      },
      pendingWaiver: false,
      primaryColor: "#76335a",
      accentColor: "#e99ac4",
    });

    expect(html).toContain("חשבונית מס");
    expect(html).toContain("הודעה נפרדת");
  });
});
