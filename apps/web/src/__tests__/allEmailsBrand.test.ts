/**
 * Every transactional email shell carries the brand gradient (header band + button)
 * with a solid bgcolor fallback, filled at send time from the studio's colours.
 * Run: pnpm -C apps/web test allEmailsBrand.test.ts
 */
import { describe, expect, it } from "vitest";
import { deriveEmailBrand, emailGradient, whiteContrast } from "../../../../packages/shared/src/email/brand";
import { renderAdminAnnouncementHtml } from "../../../../supabase/functions/_shared/render-admin-announcement-email.ts";
import { renderPaymentReminderHtml } from "../../../../supabase/functions/_shared/render-payment-email.ts";
import { renderEnrolmentConfirmationHtml } from "../../../../supabase/functions/_shared/render-enrolment-confirmation-email.ts";
import { renderPhotographerEmail } from "../../../../supabase/functions/_shared/photographer-emails/render.ts";
import { PHOTOGRAPHER_EMAIL_VARIABLES } from "../../../../supabase/functions/_shared/photographer-email-shells/generated.ts";
import { renderAppointmentClientConfirmationHtml } from "../../../../supabase/functions/_shared/render-appointment-confirmation-email.ts";

const primaryColor = "#76335a";
const accentColor = "#e99ac4";
const brand = deriveEmailBrand(primaryColor, accentColor);

function renderAll(language: "en" | "he") {
  const photographerVars = Object.fromEntries(
    PHOTOGRAPHER_EMAIL_VARIABLES.shoot_reminder.map((name: string) => [name, `${name}-x`]),
  );
  return {
    admin: renderAdminAnnouncementHtml({ language, schoolName: "Creative Ballet", subject: "Hello", body: "Body text", primaryColor, accentColor }),
    payment: renderPaymentReminderHtml({
      language, schoolName: "Creative Ballet", recipientName: "Miriam", amountFormatted: "₪350.00", className: "Mini",
      dueDate: "23 Jun 2026", paymentUrl: "https://x.test/pay", description: "Miriam — Mini", primaryColor, accentColor,
      intro: "Please pay.", ctaButton: "Pay now",
    }),
    enrolment: renderEnrolmentConfirmationHtml({
      language, schoolName: "Creative Ballet", recipientName: "Sarah", studentName: "Miriam", showStudentRow: true,
      className: "Primary", classDetails: { day: "Tuesday", time: "17:00", startDate: "1 Sep 2026", teacher: "Anna" },
      paymentSummary: { amountFormatted: "₪350", paidOnFormatted: "23 Jun 2026", paymentMethodLabel: "Visa" },
      pendingWaiver: false, primaryColor, accentColor,
    } as never),
    photographer: renderPhotographerEmail({
      key: "shoot_reminder", language, schoolName: "Lumen", primaryColor, accentColor, variables: photographerVars,
    } as never).html,
  };
}

describe("brand gradient in every transactional email shell", () => {
  for (const language of ["en", "he"] as const) {
    it(`header band + solid fallback from the studio's colours, no placeholders left (${language})`, () => {
      for (const [name, html] of Object.entries(renderAll(language))) {
        expect(html, name).toContain(emailGradient(brand));
        expect(html, name).toContain(`bgcolor="${brand.fill}"`);
        expect(html, name).toContain(`background-color:${brand.fill}`);
        expect(html, name).not.toContain("{{BRAND");
        expect(html, name).not.toContain("{{");
        expect(html, name).toContain("<table");
      }
    });
  }

  it("the payment reminder's pay button is the gradient button (header band + button)", () => {
    const html = renderAll("en").payment;
    expect(html.match(new RegExp(`bgcolor="${brand.fill}"`, "g"))?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Pay now");
  });

  it("a different studio gets different colours; white text is AA on fallback and gradient end", () => {
    const other = renderAdminAnnouncementHtml({ language: "en", schoolName: "Lens", subject: "s", body: "b", primaryColor: "#0b6e4f", accentColor: "#21d1c2" });
    const otherBrand = deriveEmailBrand("#0b6e4f", "#21d1c2");
    expect(other).toContain(emailGradient(otherBrand));
    expect(other).not.toContain(brand.fill);
    for (const b of [brand, otherBrand]) {
      expect(whiteContrast(b.fill)).toBeGreaterThanOrEqual(4.5);
      expect(whiteContrast(b.end)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("appointment confirmation's waiver button is a gradient button with a solid fallback", () => {
    const html = renderAppointmentClientConfirmationHtml({
      language: "en", serviceName: "Mini session", whenFormatted: "Tue 17:00", location: "Studio", recipientName: "Dana",
      pendingWaiver: true, signUrl: "https://x.test/sign", deadlineDate: "1 Dec", schoolName: "Lumen",
      paymentSummary: { amountFormatted: "₪100", paidOnFormatted: "today", paymentMethodLabel: "Visa" },
    } as never, primaryColor);
    const b = deriveEmailBrand(primaryColor, primaryColor);
    expect(html).toContain(`bgcolor="${b.fill}"`);
    expect(html).toContain(emailGradient(b));
  });
});
