# Lawyer pack (one file for the lawyer)

`OpalSwift-lawyer-pack.pdf` is the file the owner sends to the lawyer: a cover (what OpalSwift is, free beta, what to check, the open questions), a table of contents with page numbers, then every document in English and Hebrew: platform terms, OpalSwift privacy policy, DPA, the studio templates (enrolment terms, health declaration, marketing consent, in-app consent texts, photography contract), the accessibility statement and the beta launch checklist. `OpalSwift-lawyer-pack.docx` is the same content for editing.

The sources are the Markdown files in `docs/legal`. There is only ever **one** current pack: the build first deletes every PDF/DOCX in this folder, so never keep old or versioned copies here (git keeps the history). The cover shows the build date. **Rebuild after any change to them:**

```sh
pnpm install            # once; needs the repo's node_modules
node docs/legal/lawyer-pack/build.mjs
```

The build uses the repo's `marked` and Heebo font, the Playwright Chromium (print to PDF, Hebrew right-to-left), `python3` with `pypdf` (page numbers for the contents) and `pandoc` (the .docx; skipped if missing). The English version of each document prevails; the cover says so.
