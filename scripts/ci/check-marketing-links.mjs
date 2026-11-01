#!/usr/bin/env node
// Checks the static marketing site (apps/marketing/public): every local
// href/src/action/url() in every HTML or JS file must point to a file that
// exists (error). A "page.html#anchor" or url(#id) whose id is not on that
// page is a warning only: the live site already has a few, and fixing content
// is a separate change. External links, mailto:/tel:, data: and /api/*
// (Pages Functions) are skipped.
//
//   node scripts/ci/check-marketing-links.mjs apps/marketing/public
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, relative, extname } from "node:path";

const root = resolve(process.argv[2] ?? "apps/marketing/public");
if (!existsSync(join(root, "index.html"))) {
  console.error(`::error::${root}/index.html is missing`);
  process.exit(1);
}

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(root);

const idsCache = new Map();
function idsOf(file) {
  if (!idsCache.has(file)) {
    const html = readFileSync(file, "utf8");
    idsCache.set(file, new Set([...html.matchAll(/\sid=["']([^"']+)["']/g)].map((m) => m[1])));
  }
  return idsCache.get(file);
}

const skip = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/api\/|\$\{|\{)/i;
const problems = [];
const warnings = [];

for (const file of files.filter((f) => [".html", ".js", ".css"].includes(extname(f)))) {
  const text = readFileSync(file, "utf8");
  const refs = [
    ...text.matchAll(/\s(?:href|src|action)=["']([^"']*)["']/g),
    ...text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g),
  ].map((m) => m[1].trim());
  for (const ref of refs) {
    if (!ref || skip.test(ref)) continue;
    const [pathPart, hash] = ref.split("#");
    const clean = pathPart.split("?")[0];
    const target = clean
      ? clean.startsWith("/")
        ? join(root, clean)
        : resolve(dirname(file), clean)
      : file;
    const where = relative(root, file);
    let resolved = target;
    if (existsSync(target) && statSync(target).isDirectory()) resolved = join(target, "index.html");
    // Pages serves /page as /page.html
    if (!existsSync(resolved) && existsSync(`${resolved}.html`)) resolved = `${resolved}.html`;
    if (!existsSync(resolved)) {
      problems.push(`${where}: "${ref}" → no such file`);
      continue;
    }
    if (hash && extname(resolved) === ".html" && extname(file) === ".html" && !idsOf(resolved).has(decodeURIComponent(hash))) {
      warnings.push(`${where}: "${ref}" → no id="${hash}" on ${relative(root, resolved)}`);
    }
  }
}

for (const w of new Set(warnings)) console.log(`::warning::${w}`);
if (problems.length) {
  for (const p of problems) console.error(`::error::${p}`);
  console.error(`${problems.length} broken link(s) in ${relative(process.cwd(), root) || "."}`);
  process.exit(1);
}
console.log(`marketing links OK: ${files.length} files checked, ${new Set(warnings).size} anchor warning(s)`);
