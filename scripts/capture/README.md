# Portfolio capture suite

Generates the UX case-study assets for the enrolment flow: one guest-enrolment
video (mobile, visible cursor, MP4) and four full-page stills at 2x.

```bash
pnpm capture:assets          # reseed + video + stills
pnpm capture:assets --video  # reseed + video only
pnpm capture:assets --stills # reseed + stills only
HEADED=1 pnpm capture:assets # watch the browser while it records
```

Output: `captures/video/guest-enrolment-flow.mp4` (+ `.webm` master) and
`captures/stills/01…04*.png`.

## Safety

- Seeding loads **`.env.dev` directly** and force-pins the dev Supabase project
  (`acmujrhavgbamdilzuew`). It refuses to run against anything else — there is
  no bypass flag. The active root `.env` (which may point at production) is
  ignored entirely.
- The app itself runs on `apps/web/.env.local`, which also targets the dev
  project. Nothing in this suite can reach production.
- Payments use the built-in `mock` provider (test card `4580458045804580`).
  Test-mode labels are deliberately left visible in every capture.

## What the seed creates (see `config.mjs` for every constant)

- Tenant renamed to **Studio Aviv**, `payment_provider = 'mock'`
  (run `pnpm seed:dev` to restore the Creative Ballet dev identity).
- **Ballet — Ages 6-9**, Tuesdays 16:00–17:00, season Fall 2026.
- **Dana Cohen** `dana.cohen@example.com` / `devPassword123` — registered
  *before* any capture runs, so the email-recognition beat fires.
  - **Maya Cohen (7)** — pre-enrolled ACTIVE in Ballet (feeds the
    duplicate-block still).
  - **Noa Cohen (4)** — below the age band (feeds the age-rule still).
- **Tamar Levi** `admin@studioaviv.example.com` / `devPassword123`
  (tenant admin; records the walk-in cash payment).

Re-running the seed also deletes rows created by *previous capture runs*
(the guest-take family `danacohen@example.com`, the walk-in Peretz family,
Noa's age-review requests), so every run starts visually identical.

## Known behaviours the scripts encode

- The app **hard-blocks guest checkout on a registered email** (Next disabled;
  "Sign in" leaves for /login with a resume intent). The video therefore holds
  on the recognition prompt with Dana's real address, then switches to the
  unregistered `danacohen@example.com` to finish as a true guest.
- The waiver has a scroll-to-bottom gate; the script scrolls the document
  region before the checkboxes appear.
- The invoice document number on still 04 is written asynchronously by the
  invoicing pipeline; the script reload-polls the payments drawer for up to
  90s and screenshots either way.
- Playwright records WebM; the script transcodes to MP4 with ffmpeg from PATH
  or Playwright's own bundled binary.
