import { describe, expect, it } from "vitest";
import { buildAdminCompletionLinkEmailCopy } from "../../../../supabase/functions/_shared/enrolment-payment-email.ts";
import { renderPaymentReminderHtml } from "../../../../supabase/functions/_shared/render-payment-email.ts";

describe("buildAdminCompletionLinkEmailCopy", () => {
  it("includes student, class, and due date in English copy", () => {
    const copy = buildAdminCompletionLinkEmailCopy({
      language: "en",
      studentName: "Esther Stern",
      className: "Mini",
      dueDate: "23 Jun 2026",
    });

    expect(copy.intro).toContain("Esther Stern");
    expect(copy.intro).toContain("Mini");
    expect(copy.ctaButton).toBe("Complete enrollment");
    expect(copy.description).toBe("Esther Stern — Mini");
    expect(copy.dueDate).toBe("23 Jun 2026");
  });

  it("includes student, class, and due date in Hebrew copy", () => {
    const copy = buildAdminCompletionLinkEmailCopy({
      language: "he",
      studentName: "Esther Stern",
      className: "Mini",
      dueDate: "23 ביוני 2026",
    });

    expect(copy.intro).toContain("Esther Stern");
    expect(copy.intro).toContain("Mini");
    expect(copy.ctaButton).toBe("השלמת הרשמה ותשלום");
    expect(copy.dueDate).toBe("23 ביוני 2026");
  });
});

describe("renderPaymentReminderHtml (admin completion link)", () => {
  it("renders amount due and due date in the email body", () => {
    const html = renderPaymentReminderHtml({
      language: "en",
      schoolName: "Creative Ballet Academy",
      recipientName: "Miriam R Stern",
      amountFormatted: "₪350.00",
      className: "Mini",
      dueDate: "23 Jun 2026",
      paymentUrl: "http://localhost:5173/enrol/pay/test?t=abc",
      description: "Esther Stern — Mini",
      primaryColor: "#4c1d95",
      accentColor: "#ec4899",
      intro: "Please complete enrollment for Esther Stern in Mini using the link below.",
      ctaButton: "Complete enrollment",
    });

    expect(html).toContain("₪350.00");
    expect(html).toContain("23 Jun 2026");
    expect(html).toContain("Mini");
    expect(html).toContain("Complete enrollment");
    expect(html).toContain("Please complete enrollment for Esther Stern in Mini");
    expect(html).not.toContain("Amount Due:</strong> </td>");
  });
});
