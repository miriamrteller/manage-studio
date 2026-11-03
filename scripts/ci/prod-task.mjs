#!/usr/bin/env node
/**
 * Prod tasks: reviewed one-off DATA changes in supabase/prod-tasks/, run on
 * prod by .github/workflows/prod-task.yml (docs/deployment/PROD-TASKS.md).
 *
 *   node scripts/ci/prod-task.mjs check [file ...]
 *       Each file (default: every supabase/prod-tasks/*.sql) must be named
 *       <UTC timestamp>_<snake_case>.sql and hold data statements only:
 *       INSERT / UPDATE / DELETE / MERGE / SELECT / WITH / VALUES / DO /
 *       SET LOCAL. No schema changes (those are migrations), no transaction
 *       control (the workflow owns the transaction), no psql backslash
 *       commands. CI runs this on every PR; the workflow runs it again.
 *
 *   node scripts/ci/prod-task.mjs report <stdout-file> <stderr-file>
 *       Prints what psql said with every row of data removed: only command
 *       tags (UPDATE 3, INSERT 0 1, ...), row-count footers and bare SQLSTATE
 *       error lines survive. Everything else is counted, never shown.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const TASK_DIR = 'supabase/prod-tasks';

const ALLOWED = new Set(['insert', 'update', 'delete', 'merge', 'select', 'with', 'values', 'do']);
const TXN = new Set(['begin', 'commit', 'rollback', 'end', 'abort', 'start', 'savepoint', 'release', 'prepare']);
const SCHEMA = new Set(['create', 'alter', 'drop', 'grant', 'revoke', 'truncate', 'comment', 'security', 'reindex', 'vacuum', 'cluster', 'refresh', 'import']);
const DDL_IN_BODY = /\b(create|alter|drop|grant|revoke|truncate|commit|rollback)\b/i;

/** `20261103121500_fix_lead_status.sql` with a real date. */
export function checkFileName(name) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})_[a-z0-9]+(_[a-z0-9]+)*\.sql$/.exec(name);
  if (!m) return [`${name}: name must be <UTC timestamp YYYYMMDDHHMMSS>_<snake_case>.sql`];
  const [, y, mo, d, h, mi, s] = m.map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d || t.getUTCHours() !== h || t.getUTCMinutes() !== mi || t.getUTCSeconds() !== s) {
    return [`${name}: ${name.slice(0, 14)} is not a real UTC timestamp`];
  }
  return [];
}

/**
 * Removes comments and the contents of quoted strings/identifiers, so the
 * checks below see only SQL code. Dollar-quoted bodies (DO $$ ... $$) are
 * returned separately so they can be checked too.
 */
export function stripSql(sql) {
  let out = '';
  const bodies = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') i++;
      out += ' ';
    } else if (c === '/' && next === '*') {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') { depth++; i += 2; }
        else if (sql[i] === '*' && sql[i + 1] === '/') { depth--; i += 2; }
        else i++;
      }
      out += ' ';
    } else if (c === "'") {
      // E'...' strings treat backslash as an escape; standard strings do not.
      const escapes = /[eE]$/.test(out) && !/[A-Za-z0-9_][eE]$/.test(out);
      i++;
      while (i < n) {
        if (escapes && sql[i] === '\\') { i += 2; continue; }
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { i += 2; continue; }
          break;
        }
        i++;
      }
      i++;
      out += "''";
    } else if (c === '"') {
      i++;
      while (i < n) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') { i += 2; continue; }
          break;
        }
        i++;
      }
      i++;
      out += 'x';
    } else if (c === '$' && !/[A-Za-z0-9_]$/.test(out)) {
      const tag = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (!tag) { out += c; i++; continue; }
      const end = sql.indexOf(tag[0], i + tag[0].length);
      const stop = end === -1 ? n : end;
      bodies.push(sql.slice(i + tag[0].length, stop));
      i = end === -1 ? n : end + tag[0].length;
      out += '$$';
    } else {
      out += c;
      i++;
    }
  }
  return { code: out, bodies };
}

/** Problems with one task's SQL (empty list = fine). */
export function checkSql(sql) {
  const problems = [];
  const { code, bodies } = stripSql(sql);
  if (code.includes('\\')) {
    problems.push('psql backslash commands (\\i, \\o, \\copy, \\gexec, …) are not allowed; for a newline in a string use chr(10)');
  }
  const statements = code.split(';').map((s) => s.trim()).filter(Boolean);
  if (statements.length === 0) problems.push('the file has no SQL statements');
  statements.forEach((stmt, idx) => {
    const words = stmt.toLowerCase().split(/\s+/);
    const first = words[0].replace(/\(.*/, '');
    const label = `statement ${idx + 1} (${words.slice(0, 3).join(' ')}…)`;
    if (first === 'set') {
      if (words[1] !== 'local') problems.push(`${label}: use SET LOCAL, so the setting ends with the task's transaction`);
      return;
    }
    if (TXN.has(first)) problems.push(`${label}: no BEGIN/COMMIT/ROLLBACK/SAVEPOINT; the workflow runs the whole file in one transaction`);
    else if (SCHEMA.has(first)) problems.push(`${label}: schema changes are migrations (supabase/migrations), not prod tasks`);
    else if (!ALLOWED.has(first)) problems.push(`${label}: not allowed in a prod task (data statements only)`);
  });
  for (const body of bodies) {
    // Comments and strings inside the block are not code.
    const inner = stripSql(body).code;
    const hit = DDL_IN_BODY.exec(inner);
    if (hit) problems.push(`a $$ … $$ block contains "${hit[1]}": schema changes and transaction control are not allowed in a prod task`);
    if (/\bexecute\b/i.test(inner)) problems.push('a $$ … $$ block uses EXECUTE (dynamic SQL), which cannot be checked; write the statements out');
  }
  return problems;
}

export function checkFile(path) {
  const name = basename(path);
  const problems = checkFileName(name);
  let sql;
  try {
    sql = readFileSync(path, 'utf8');
  } catch {
    return [`${path}: cannot read the file`];
  }
  return [...problems, ...checkSql(sql).map((p) => `${name}: ${p}`)];
}

const TAG = /^(INSERT \d+ \d+|UPDATE \d+|DELETE \d+|MERGE \d+|SELECT \d+|DO|SET)$/;
const FOOTER = /^\((\d+) rows?\)$/;
const SQLSTATE_LINE = /^psql:[^:\n]*:\d+: (ERROR|FATAL|WARNING|NOTICE): +([0-9A-Z]{5})$/;

/**
 * psql output → lines that carry no data. `stdout` is the task's part only
 * (between the workflow's markers).
 */
export function report(stdout, stderr) {
  const lines = [];
  let hidden = 0;
  let n = 0;
  for (const raw of stdout.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (TAG.test(line)) lines.push(`${++n}. ${line}`);
    else if (FOOTER.test(line)) lines.push(`${++n}. returned ${FOOTER.exec(line)[1]} row(s) (not shown)`);
    else hidden++;
  }
  const errors = [];
  let hiddenErr = 0;
  for (const raw of stderr.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = SQLSTATE_LINE.exec(line);
    if (m) errors.push(`${m[1]} SQLSTATE ${m[2]}${m[2] === '23505' ? ' (unique violation)' : ''}`);
    else if (/^psql: error: connection/.test(line)) errors.push('could not connect to the database');
    else hiddenErr++;
  }
  return { lines, hidden, errors, hiddenErr };
}

function main(argv) {
  const [cmd, ...args] = argv;
  if (cmd === 'check') {
    let files = args;
    if (files.length === 0) {
      try {
        files = readdirSync(TASK_DIR).filter((f) => f.endsWith('.sql')).map((f) => join(TASK_DIR, f));
      } catch {
        files = [];
      }
    }
    const problems = files.flatMap(checkFile);
    for (const p of problems) console.log(`::error::${p}`);
    console.log(`${files.length} prod task file(s) checked, ${problems.length} problem(s)`);
    return problems.length ? 1 : 0;
  }
  if (cmd === 'report') {
    const [outFile, errFile] = args;
    const r = report(readFileSync(outFile, 'utf8'), errFile ? readFileSync(errFile, 'utf8') : '');
    console.log(r.lines.length ? r.lines.join('\n') : '(no row counts reported)');
    if (r.hidden) console.log(`(${r.hidden} line(s) of row data not shown)`);
    for (const e of r.errors) console.log(`error: ${e}`);
    if (r.hiddenErr) console.log(`(${r.hiddenErr} line(s) of error detail not shown, they may contain data)`);
    return 0;
  }
  console.error('usage: prod-task.mjs check [file ...] | report <stdout> <stderr>');
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main(process.argv.slice(2)));
}
