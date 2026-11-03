# CLAUDE.md

OpalSwift (manage-studio): React app in `apps/web`, Supabase in `supabase/`, shared code in `packages/shared`.

## Product rules (owner)

- **Prefill everything we can.** Any field whose value OpalSwift already knows (from the studio, the person, a previous signed form, the class, the season, etc.) must be prefilled and editable, never asked blank. Fully inferable settings are hidden behind "Details we filled in for you".
