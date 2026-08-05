/**
 * Guard for destructive dev-only scripts.
 *
 * `supabase link` switches the whole repo's target. Once the production project
 * exists, a stale link plus `pnpm seed:dev` would overwrite a real tenant's rows
 * with demo data, and there is no undo short of PITR. These scripts are dev-only
 * by intent but were dev-only by convention — this makes it enforceable.
 *
 * The dev ref is pinned here rather than read from the link, because reading it
 * from the link is exactly the thing that goes wrong.
 */
import { resolveProjectRef } from './psql-dev.mjs';

/** Known dev project. Override with DEV_PROJECT_REF for a second dev sandbox. */
export const DEV_PROJECT_REF = process.env.DEV_PROJECT_REF ?? 'acmujrhavgbamdilzuew';

/**
 * Exit unless the resolved project ref is the dev project.
 * @param {string} scriptName shown in the error so the operator knows what stopped
 */
export function assertDevProject(scriptName) {
  if (process.env.ALLOW_NON_DEV_PROJECT === 'true') {
    console.warn(
      `⚠  ALLOW_NON_DEV_PROJECT=true — running ${scriptName} against a non-dev project on purpose.`,
    );
    return;
  }

  const ref = resolveProjectRef();

  if (!ref) {
    console.error(
      `\n${scriptName}: cannot determine the Supabase project ref.\n` +
        `Set SUPABASE_PROJECT_REF (or SUPABASE_URL) in .env so the dev guard can check it.\n`,
    );
    process.exit(1);
  }

  if (ref !== DEV_PROJECT_REF) {
    console.error(
      `\n${'='.repeat(72)}\n` +
        `REFUSING TO RUN ${scriptName}\n` +
        `${'='.repeat(72)}\n` +
        `  linked project : ${ref}\n` +
        `  expected dev   : ${DEV_PROJECT_REF}\n\n` +
        `This script writes demo data and is destructive. The repo appears to be\n` +
        `linked to a different project — possibly production.\n\n` +
        `If you genuinely meant to target ${ref}, re-run with:\n` +
        `  ALLOW_NON_DEV_PROJECT=true <command>\n` +
        `${'='.repeat(72)}\n`,
    );
    process.exit(1);
  }
}
