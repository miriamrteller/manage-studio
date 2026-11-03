# CLAUDE.md

OpalSwift (manage-studio): React app in `apps/web`, Supabase in `supabase/`, shared code in `packages/shared`.

## Product rules (owner)

- **Prefill everything we can.** Any field whose value OpalSwift already knows (from the studio, the person, a previous signed form, the class, the season, etc.) must be prefilled and editable, never asked blank. Fully inferable settings are hidden behind "Details we filled in for you".
- **Never block the flow.** Warnings, reminders and notices are informational and dismissible. Don't add required ticks or extra steps unless the owner asked for that specific step.
- **No images of people, anywhere:** icons, illustrations, avatars, demo data, marketing.
- **Everything legal goes on the lawyer list.** Any change to legal wording (`docs/legal`, templates, consent/waiver text, DPA, privacy, terms) is marked `[[LAWYER: confirm]]` and added to `docs/legal/AWAITING-LAWYER-REVIEW.md`.
- **Only one current copy of any document.** Generated outputs (e.g. the lawyer pack) replace old versions, and superseded copies are deleted (git keeps history).
