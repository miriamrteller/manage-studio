# Payment options studios see (owner decisions, 6 and 10 Nov 2026)

## Update, 10 Nov 2026 (replaces the "different provider" part below)

The only payment choices are the studio's own YPay account, OpalSwift's Takbull, or pay at the studio.

- **Takbull** is listed first but greyed out, marked "Coming soon", until it launches. When it launches it becomes the default.
- **Own YPay** is pre-selected until then; **pay at the studio** is shown next to it.
- **Grow and Invoice4U** are no longer offered anywhere (no "Have a different provider?"). **Green Invoice** is no longer offered for documents either.
- **Hidden, not deleted:** their code stays until Takbull is live, then goes in one tidy-up. A studio already on one of them keeps it and still sees it in Settings.
- Hidden lists: `HIDDEN_PAYMENT_PROVIDERS` and `HIDDEN_INVOICING_PROVIDERS` in `apps/web/src/lib/providerPairing.ts`.

## Decision (6 Nov 2026)

Until OpalSwift has its own registered business:

- **Default:** card payments online through the studio's **own YPay account**.
- **Also shown up front:** pay at the studio (no card payments; the studio records each payment).
- **Behind "Have a different provider?":** Grow, and Invoice4U for studios that don't charge monthly fees. They stay available for now.
- **Nothing is removed from the code** until the new set-up is working.
- **YPay and monthly fees:** not hidden. It is to be tested before deciding. Today OpalSwift can't charge monthly fees through YPay (no saved cards in our integration, and the database refuses a monthly class for a YPay studio), so YPay shows a short note for studios that charge monthly fees.
- **Later (after January 2027):** Takbull, which creates the studio's account automatically, becomes the default. Takbull stays hidden until then (docs/plans/TAKBULL-INTEGRATION.md).
- **Marketing site:** no provider names, only OpalSwift's own features. Legal pages (terms, privacy, accessibility, cookies, DPA) are not changed here: whether they must name providers is for the owner and the lawyer.

## Where this lives in the code

- `apps/web/src/features/settings/components/PaymentProviderChoice.tsx`: the choice (sign-up wizard and Settings → Payment).
- `apps/web/src/features/platform/lib/studioSetupForm.ts`: the wizard starts on YPay, with YPay documents.
- `apps/web/src/features/settings/components/OfflinePaymentsSettingsForm.tsx`: Settings starts on YPay when the saved provider isn't offered.

Studios already on another provider keep it and keep seeing their own settings.

YPay abilities used are only the ones already built against YPay's API documentation: https://ypay.co.il/assets/files/api/ypay_api_documentation.pdf
