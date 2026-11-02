/**
 * Auth emails (magic link / code, studio-owner welcome): brand gradient on the
 * header band, primary button and code, email-safe (table layout, solid bgcolor
 * fallback, white text AA on the fallback and on the gradient end).
 * Run: pnpm -C apps/web test authEmailBrand.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  deriveEmailBrand,
  emailGradient,
  whiteContrast,
  OPALSWIFT_EMAIL_ANCHOR,
  OPALSWIFT_EMAIL_BRAND,
} from "../../../../packages/shared/src/email/brand";
import {
  renderAuthMagicLinkHtml,
  renderStudioOwnerWelcome,
} from "../../../../supabase/functions/_shared/render-auth-email.ts";
import { composeAuthEmail } from "../../../../supabase/functions/send-auth-email/compose.ts";
import { platformEmailConfig } from "../../../../supabase/functions/_shared/tenant-email.ts";

const COLOURS = ["#ffffff", "#000000", "#ffff00", "#00ffff", "#ff0000", "#76335a", "#5b6cff", "#21d1c2", "#4a58e8"];
const url = "https://app.opalswift.com/auth/confirm?token=abc";

describe("email brand colours", () => {
  it("white text is AA on the fill (bgcolor fallback) and the gradient end, for any colours", () => {
    for (const primary of COLOURS) {
      for (const anchor of COLOURS) {
        const { fill, end } = deriveEmailBrand(primary, anchor);
        expect(whiteContrast(fill), `${primary} fill`).toBeGreaterThanOrEqual(4.5);
        expect(whiteContrast(end), `${primary}/${anchor} end`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("OpalSwift: #4A58E8 fallback shifting toward the purple", () => {
    expect(OPALSWIFT_EMAIL_BRAND.fill.toLowerCase()).toBe("#4a58e8");
    expect(OPALSWIFT_EMAIL_BRAND.end.toLowerCase()).not.toBe("#4a58e8");
    expect(emailGradient(OPALSWIFT_EMAIL_BRAND)).toMatch(/^linear-gradient\(135deg, #4a58e8, #/i);
  });
});

describe("auth email HTML", () => {
  for (const language of ["en", "he"] as const) {
    it(`OpalSwift magic link/code (${language}): gradient header band + button + code with solid fallbacks`, () => {
      const html = renderAuthMagicLinkHtml({
        language, schoolName: "OpalSwift", magicLinkUrl: url, otpCode: "482913",
        primaryColor: "#4A58E8", accentColor: "#21D1C2", gradientAnchor: OPALSWIFT_EMAIL_ANCHOR,
      });
      expect(html).toContain("linear-gradient(135deg, #4a58e8");
      // header band, button and code each carry the solid fallback too
      expect(html.match(/bgcolor="#4a58e8"/gi)?.length).toBeGreaterThanOrEqual(2);
      expect(html.match(/background-color:#4a58e8/gi)?.length).toBeGreaterThanOrEqual(3);
      expect(html).toContain("<table");
      expect(html).not.toContain("{{");
      expect(html).not.toContain("var(--email");
      expect(html).toContain(language === "he" ? 'dir="rtl"' : 'dir="ltr"');
    });
  }

  it("a studio's emails use the studio's own colours", () => {
    const html = renderAuthMagicLinkHtml({
      language: "en", schoolName: "Creative Ballet", magicLinkUrl: url,
      primaryColor: "#76335a", accentColor: "#e99ac4",
    });
    const brand = deriveEmailBrand("#76335a", "#e99ac4");
    expect(html).toContain(`linear-gradient(135deg, ${brand.fill}, ${brand.end})`);
    expect(html).toContain(`bgcolor="${brand.fill}"`);
    expect(html).not.toContain("#4a58e8");
  });

  it("the platform host's mail shifts toward OpalSwift's purple, a studio's toward its accent", () => {
    const platform = composeAuthEmail({ action: "magiclink", tenant: platformEmailConfig("en"), confirmationUrl: url, strings: {}, studioUrl: null });
    expect(platform.html).toContain(emailGradient(OPALSWIFT_EMAIL_BRAND));
  });

  it("studio-owner welcome: OpalSwift gradient header + button, fallback #4A58E8, no leftover placeholders", () => {
    for (const language of ["en", "he"] as const) {
      const { html } = renderStudioOwnerWelcome({
        language, studioName: "Creative Ballet Academy",
        studioUrl: "https://creativeballet.opalswift.com", inviteUrl: url,
      });
      expect(html).toContain(emailGradient(OPALSWIFT_EMAIL_BRAND));
      expect(html.match(/bgcolor="#4a58e8"/gi)?.length).toBeGreaterThanOrEqual(2);
      expect(html).not.toContain("{{");
    }
  });

  it("the expiry notice text is AA on white (not the accent)", () => {
    const html = renderAuthMagicLinkHtml({
      language: "en", schoolName: "Creative Ballet", magicLinkUrl: url,
      primaryColor: "#76335a", accentColor: "#21d1c2",
    });
    expect(html).toContain("#b45309");
  });
});
