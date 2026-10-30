/**
 * Browser-only, in-memory stand-in for the supabase-js client used by the
 * demo build (VITE_DEMO_MODE=true). It implements the subset of the query
 * builder the app uses: select with nested embeds, insert/update/upsert/
 * delete, the common filters, ordering, ranges, counts, single/maybeSingle,
 * plus auth, rpc, functions.invoke, storage and realtime no-ops.
 *
 * Embeds are resolved by naming convention: `people(...)` on a row with a
 * `person_id` column is many-to-one; otherwise the embedded table's rows
 * pointing back at this row (`<singular parent>_id`) are returned as an array,
 * or as an object when that column is the embedded table's primary key.
 * A `!hint` naming a column (or a `<table>_<column>_fkey` constraint) wins.
 */

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

export interface DemoError {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

export interface DemoResult<T = unknown> {
  data: T;
  error: DemoError | null;
  count?: number | null;
  status?: number;
}

export interface DemoUser {
  id: string;
  email: string;
}

export type RpcHandler = (args: Row, ctx: DemoContext) => unknown;
export type FunctionHandler = (body: Row, ctx: DemoContext) => unknown;

export interface DemoContext {
  db: Tables;
  user: DemoUser | null;
  uuid: () => string;
  now: () => string;
}

/** Thrown inside RPC/function handlers to return a PostgREST-style error. */
export class DemoRpcError extends Error {
  constructor(message: string, public code = 'P0001') {
    super(message);
  }
}

const IRREGULAR_SINGULAR: Record<string, string> = {
  people: 'person',
  waiver_evidence: 'waiver_evidence',
  staff: 'staff',
  user_profiles: 'user_profile',
  contact_preferences: 'contact_preference',
};

/** Tables whose primary key is a foreign key (1:1 children). */
const PK_COLUMN: Record<string, string> = {
  job_details: 'engagement_id',
};

function singular(table: string): string {
  if (IRREGULAR_SINGULAR[table]) return IRREGULAR_SINGULAR[table];
  if (table.endsWith('ies')) return `${table.slice(0, -3)}y`;
  if (table.endsWith('ses')) return table.slice(0, -2);
  if (table.endsWith('s')) return table.slice(0, -1);
  return table;
}

function pkOf(table: string, row: Row): unknown {
  return row[PK_COLUMN[table] ?? 'id'];
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

// ---------------------------------------------------------------------------
// select-string parsing
// ---------------------------------------------------------------------------

interface SelectField {
  kind: 'star' | 'column' | 'embed';
  name: string; // column or table name
  alias: string;
  hint?: string;
  inner?: boolean;
  children?: SelectField[];
  /** json path: col->key / col->>key */
  jsonPath?: string[];
}

function splitTopLevel(input: string, sep = ','): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of input) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

function parseSelect(input: string | undefined): SelectField[] {
  const src = (input ?? '*').replace(/\s+/g, ' ').trim() || '*';
  return splitTopLevel(src).map((part): SelectField => {
    const paren = part.indexOf('(');
    if (paren >= 0 && part.endsWith(')')) {
      const head = part.slice(0, paren).trim();
      const inner = part.slice(paren + 1, -1);
      let alias: string | undefined;
      let rest = head;
      const colon = head.indexOf(':');
      if (colon >= 0) {
        alias = head.slice(0, colon).trim();
        rest = head.slice(colon + 1).trim();
      }
      const bits = rest.split('!').map((b) => b.trim());
      const name = bits[0];
      let hint: string | undefined;
      let innerJoin = false;
      for (const b of bits.slice(1)) {
        if (b === 'inner') innerJoin = true;
        else if (b === 'left') innerJoin = false;
        else hint = b;
      }
      return {
        kind: 'embed',
        name,
        alias: alias ?? name,
        hint,
        inner: innerJoin,
        children: parseSelect(inner),
      };
    }
    if (part === '*') return { kind: 'star', name: '*', alias: '*' };
    let alias: string | undefined;
    let rest = part.replace(/::[a-z_]+$/i, '');
    const colon = rest.indexOf(':');
    if (colon >= 0) {
      alias = rest.slice(0, colon).trim();
      rest = rest.slice(colon + 1).trim();
    }
    const segs = rest.split(/->>?/);
    const name = segs[0].trim();
    if (segs.length > 1) {
      const last = segs[segs.length - 1].trim();
      return { kind: 'column', name, alias: alias ?? last, jsonPath: segs.slice(1).map((s) => s.trim()) };
    }
    return { kind: 'column', name, alias: alias ?? name };
  });
}

// ---------------------------------------------------------------------------
// value comparison helpers
// ---------------------------------------------------------------------------

function cmp(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  const as = String(a);
  const bs = String(b);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'boolean' || typeof b === 'boolean') return String(a) === String(b);
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return String(a) === String(b);
}

function likeToRegex(pattern: string, flags: string): RegExp {
  const esc = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[%*]/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${esc}$`, flags);
}

function parseListLiteral(v: string): string[] {
  const inner = v.replace(/^\(/, '').replace(/\)$/, '');
  return splitTopLevel(inner).map((s) => s.replace(/^"|"$/g, ''));
}

function coerceLiteral(v: string): unknown {
  if (v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

type Getter = (row: Row) => unknown;

function makeOpPredicate(get: Getter, op: string, raw: unknown): (row: Row) => boolean {
  const val = typeof raw === 'string' ? coerceLiteral(raw) : raw;
  switch (op) {
    case 'eq':
      return (r) => looseEq(get(r), val);
    case 'neq':
      return (r) => !looseEq(get(r), val);
    case 'gt':
      return (r) => get(r) != null && cmp(get(r), val) > 0;
    case 'gte':
      return (r) => get(r) != null && cmp(get(r), val) >= 0;
    case 'lt':
      return (r) => get(r) != null && cmp(get(r), val) < 0;
    case 'lte':
      return (r) => get(r) != null && cmp(get(r), val) <= 0;
    case 'is':
      return (r) => (val === null ? get(r) == null : get(r) === val);
    case 'like':
      return (r) => get(r) != null && likeToRegex(String(val), '').test(String(get(r)));
    case 'ilike':
      return (r) => get(r) != null && likeToRegex(String(val), 'i').test(String(get(r)));
    case 'in': {
      const list = Array.isArray(val) ? val : parseListLiteral(String(val));
      return (r) => list.some((x) => looseEq(get(r), x));
    }
    case 'cs': {
      const list = Array.isArray(val) ? val : parseListLiteral(String(val).replace(/^\{|\}$/g, ''));
      return (r) => {
        const cur = get(r);
        return Array.isArray(cur) && list.every((x) => cur.some((c) => looseEq(c, x)));
      };
    }
    case 'ov': {
      const list = Array.isArray(val) ? val : parseListLiteral(String(val).replace(/^\{|\}$/g, ''));
      return (r) => {
        const cur = get(r);
        return Array.isArray(cur) && list.some((x) => cur.some((c) => looseEq(c, x)));
      };
    }
    default:
      return () => true;
  }
}

function getterFor(column: string): Getter {
  // json path: col->>key
  if (column.includes('->')) {
    const segs = column.split(/->>?/);
    return (r) => {
      let cur: unknown = r[segs[0]];
      for (const s of segs.slice(1)) {
        if (cur == null || typeof cur !== 'object') return null;
        cur = (cur as Row)[s];
      }
      return cur;
    };
  }
  // embedded filter: table.column (evaluated against the projected row)
  if (column.includes('.')) {
    const [rel, ...restParts] = column.split('.');
    const rest = restParts.join('.');
    const inner = getterFor(rest);
    return (r) => {
      const emb = r[rel];
      if (Array.isArray(emb)) return emb.map((e) => inner(e as Row));
      if (emb && typeof emb === 'object') return inner(emb as Row);
      return undefined;
    };
  }
  return (r) => r[column];
}

/** Parses PostgREST `or=(a.eq.1,b.is.null,and(c.gt.2,d.lt.3))` filter strings. */
function parseOr(expr: string, prefix?: string): (row: Row) => boolean {
  const parts = splitTopLevel(expr);
  const preds = parts.map((p) => parseCondition(p, prefix));
  return (r) => preds.some((f) => f(r));
}

function parseAnd(expr: string, prefix?: string): (row: Row) => boolean {
  const parts = splitTopLevel(expr);
  const preds = parts.map((p) => parseCondition(p, prefix));
  return (r) => preds.every((f) => f(r));
}

function parseCondition(cond: string, prefix?: string): (row: Row) => boolean {
  if (cond.startsWith('and(')) return parseAnd(cond.slice(4, -1), prefix);
  if (cond.startsWith('or(')) return parseOr(cond.slice(3, -1), prefix);
  const m = cond.match(/^([^.]+(?:->>?[^.]+)*)\.(not\.)?([a-z]+)\.(.*)$/);
  if (!m) return () => true;
  const [, col, negate, op, value] = m;
  const full = prefix ? `${prefix}.${col}` : col;
  const pred = makeOpPredicate(getterFor(full), op, value);
  return negate ? (r) => !pred(r) : pred;
}

// ---------------------------------------------------------------------------
// projection with embeds
// ---------------------------------------------------------------------------

function resolveEmbed(db: Tables, parentTable: string, parent: Row, field: SelectField): Row | Row[] | null {
  const target = field.name;
  const targetRows = db[target] ?? [];
  const hint = field.hint;

  // Hinted foreign key column on the parent row.
  let fkCol: string | undefined;
  if (hint) {
    if (hint in parent) fkCol = hint;
    else {
      const m = hint.match(/^(.+)_fkey$/);
      if (m) {
        const tail = m[1].startsWith(`${parentTable}_`) ? m[1].slice(parentTable.length + 1) : m[1];
        if (tail in parent) fkCol = tail;
        else {
          // constraint lives on the target table: reverse lookup
          const rtail = m[1].startsWith(`${target}_`) ? m[1].slice(target.length + 1) : m[1];
          const pk = pkOf(parentTable, parent);
          const matches = targetRows.filter((r) => looseEq(r[rtail], pk));
          return PK_COLUMN[target] === rtail ? matches[0] ?? null : matches;
        }
      }
    }
  }
  if (!fkCol) {
    const guess = `${singular(target)}_id`;
    if (guess in parent && guess !== PK_COLUMN[parentTable]) fkCol = guess;
    else if (guess in parent && PK_COLUMN[parentTable] === guess) fkCol = guess;
  }
  if (fkCol) {
    const id = parent[fkCol];
    if (id == null) return null;
    return targetRows.find((r) => looseEq(pkOf(target, r), id)) ?? null;
  }

  // One-to-many (or one-to-one when the back-reference is the target's PK).
  const back = `${singular(parentTable)}_id`;
  const pk = pkOf(parentTable, parent);
  const matches = targetRows.filter((r) => looseEq(r[back], pk));
  if (PK_COLUMN[target] === back) return matches[0] ?? null;
  return matches;
}

function project(db: Tables, table: string, row: Row, fields: SelectField[]): Row | null {
  const out: Row = {};
  for (const f of fields) {
    if (f.kind === 'star') {
      Object.assign(out, row);
    } else if (f.kind === 'column') {
      let v: unknown = row[f.name];
      if (f.jsonPath) {
        for (const k of f.jsonPath) {
          v = v && typeof v === 'object' ? (v as Row)[k] : null;
        }
      }
      out[f.alias] = v === undefined ? null : v;
    }
  }
  for (const f of fields) {
    if (f.kind !== 'embed') continue;
    const resolved = resolveEmbed(db, table, row, f);
    const children = f.children ?? [];
    if (Array.isArray(resolved)) {
      const list = resolved.map((r) => project(db, f.name, r, children)).filter((r): r is Row => r !== null);
      if (f.inner && list.length === 0) return null;
      out[f.alias] = list;
    } else if (resolved) {
      const p = project(db, f.name, resolved, children);
      if (f.inner && !p) return null;
      out[f.alias] = p;
    } else {
      if (f.inner) return null;
      out[f.alias] = null;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// query builder
// ---------------------------------------------------------------------------

type Op = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

export interface FakeHooks {
  /** Called before a write; may fill defaults. */
  beforeInsert?: (table: string, row: Row, ctx: DemoContext) => void;
  afterWrite?: (table: string, op: Op, rows: Row[], ctx: DemoContext) => void;
  /** Row-level visibility for the signed-in user (simulated RLS). */
  canRead?: (table: string, row: Row, ctx: DemoContext) => boolean;
  onUnknown?: (kind: string, name: string) => void;
}

class QueryBuilder implements PromiseLike<DemoResult> {
  private op: Op = 'select';
  private payload: Row | Row[] | null = null;
  private selectFields: SelectField[] | null = null;
  private wantReturn = false;
  private countMode: string | null = null;
  private head = false;
  private baseFilters: Array<(r: Row) => boolean> = [];
  private projectedFilters: Array<(r: Row) => boolean> = [];
  private orders: Array<{ col: string; asc: boolean; nullsFirst?: boolean }> = [];
  private limitN: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private singleMode: 'single' | 'maybe' | null = null;
  private onConflict: string | null = null;
  private ignoreDuplicates = false;

  constructor(private client: FakeSupabaseClient, private table: string) {}

  select(cols?: string, opts?: { count?: string; head?: boolean }) {
    this.selectFields = parseSelect(cols);
    this.wantReturn = true;
    if (opts?.count) this.countMode = opts.count;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }
  upsert(payload: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = 'upsert';
    this.payload = payload;
    this.onConflict = opts?.onConflict ?? null;
    this.ignoreDuplicates = Boolean(opts?.ignoreDuplicates);
    return this;
  }
  update(payload: Row) {
    this.op = 'update';
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }

  private addFilter(col: string, pred: (r: Row) => boolean) {
    if (col.includes('.') && !col.includes('->')) this.projectedFilters.push(pred);
    else this.baseFilters.push(pred);
    return this;
  }

  eq(col: string, v: unknown) {
    return this.addFilter(col, makeOpPredicate(getterFor(col), 'eq', v));
  }
  neq(col: string, v: unknown) {
    return this.addFilter(col, makeOpPredicate(getterFor(col), 'neq', v));
  }
  gt(col: string, v: unknown) {
    return this.addFilter(col, makeOpPredicate(getterFor(col), 'gt', v));
  }
  gte(col: string, v: unknown) {
    return this.addFilter(col, makeOpPredicate(getterFor(col), 'gte', v));
  }
  lt(col: string, v: unknown) {
    return this.addFilter(col, makeOpPredicate(getterFor(col), 'lt', v));
  }
  lte(col: string, v: unknown) {
    return this.addFilter(col, makeOpPredicate(getterFor(col), 'lte', v));
  }
  like(col: string, v: string) {
    return this.addFilter(col, makeOpPredicate(getterFor(col), 'like', v));
  }
  ilike(col: string, v: string) {
    return this.addFilter(col, makeOpPredicate(getterFor(col), 'ilike', v));
  }
  is(col: string, v: unknown) {
    return this.addFilter(col, makeOpPredicate(getterFor(col), 'is', v));
  }
  in(col: string, vs: unknown[]) {
    return this.addFilter(col, makeOpPredicate(getterFor(col), 'in', vs));
  }
  contains(col: string, vs: unknown) {
    return this.addFilter(col, makeOpPredicate(getterFor(col), 'cs', vs));
  }
  overlaps(col: string, vs: unknown) {
    return this.addFilter(col, makeOpPredicate(getterFor(col), 'ov', vs));
  }
  match(obj: Row) {
    for (const [k, v] of Object.entries(obj)) this.eq(k, v);
    return this;
  }
  not(col: string, op: string, v: unknown) {
    const pred = makeOpPredicate(getterFor(col), op, v);
    return this.addFilter(col, (r) => !pred(r));
  }
  filter(col: string, op: string, v: unknown) {
    const negate = op.startsWith('not.');
    const pred = makeOpPredicate(getterFor(col), negate ? op.slice(4) : op, v);
    return this.addFilter(col, negate ? (r) => !pred(r) : pred);
  }
  or(expr: string, opts?: { foreignTable?: string; referencedTable?: string }) {
    const prefix = opts?.referencedTable ?? opts?.foreignTable;
    const pred = parseOr(expr, prefix);
    if (prefix || /\w+\.\w+\.\w+\./.test(expr)) this.projectedFilters.push(pred);
    else this.baseFilters.push(pred);
    return this;
  }
  textSearch(col: string, q: string) {
    return this.addFilter(col, (r) => String(r[col] ?? '').toLowerCase().includes(q.toLowerCase()));
  }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string; referencedTable?: string }) {
    if (opts?.foreignTable || opts?.referencedTable) return this;
    this.orders.push({ col, asc: opts?.ascending ?? true, nullsFirst: opts?.nullsFirst });
    return this;
  }
  limit(n: number, opts?: { foreignTable?: string; referencedTable?: string }) {
    if (opts?.foreignTable || opts?.referencedTable) return this;
    this.limitN = n;
    return this;
  }
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  abortSignal() {
    return this;
  }
  returns() {
    return this;
  }
  throwOnError() {
    return this;
  }
  maybeSingle() {
    this.singleMode = 'maybe';
    return this;
  }
  single() {
    this.singleMode = 'single';
    return this;
  }

  private tableRows(): Row[] {
    const db = this.client.db;
    return db[this.table] ?? (db[this.table] = []);
  }

  private matchingBase(): Row[] {
    const ctx = this.client.ctx();
    const hooks = this.client.hooks;
    return this.tableRows().filter(
      (r) => this.baseFilters.every((f) => f(r)) && (!hooks.canRead || hooks.canRead(this.table, r, ctx)),
    );
  }

  private finishRows(base: Row[]): { rows: Row[]; total: number } {
    const fields = this.selectFields ?? parseSelect('*');
    let pairs = base
      .map((r) => ({ raw: r, out: project(this.client.db, this.table, r, fields) }))
      .filter((p): p is { raw: Row; out: Row } => p.out !== null);
    if (this.projectedFilters.length) {
      pairs = pairs.filter((p) => this.projectedFilters.every((f) => f({ ...p.raw, ...p.out })));
    }
    if (this.orders.length) {
      pairs = [...pairs].sort((a, b) => {
        for (const o of this.orders) {
          const av = getterFor(o.col)({ ...a.raw, ...a.out });
          const bv = getterFor(o.col)({ ...b.raw, ...b.out });
          if (av == null && bv == null) continue;
          if (av == null || bv == null) {
            const nullsFirst = o.nullsFirst ?? !o.asc;
            return (av == null ? -1 : 1) * (nullsFirst ? 1 : -1);
          }
          const c = cmp(av, bv);
          if (c !== 0) return o.asc ? c : -c;
        }
        return 0;
      });
    }
    const total = pairs.length;
    let rows = pairs.map((p) => p.out);
    if (this.rangeFrom != null && this.rangeTo != null) rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    return { rows, total };
  }

  private execute(): DemoResult {
    const ctx = this.client.ctx();
    const hooks = this.client.hooks;
    try {
      if (this.op === 'select') {
        const { rows, total } = this.finishRows(this.matchingBase());
        return this.shape(rows, total);
      }
      if (this.op === 'insert' || this.op === 'upsert') {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
        const written: Row[] = [];
        for (const p of list) {
          if (this.op === 'upsert') {
            const keys = (this.onConflict ?? PK_COLUMN[this.table] ?? 'id').split(',').map((k) => k.trim());
            const existing = this.tableRows().find((r) => keys.every((k) => p[k] !== undefined && looseEq(r[k], p[k])));
            if (existing) {
              if (!this.ignoreDuplicates) Object.assign(existing, p, { updated_at: ctx.now() });
              written.push(existing);
              continue;
            }
          }
          const row: Row = { ...p };
          if (!PK_COLUMN[this.table] && row.id == null) row.id = uuid();
          if (row.created_at == null) row.created_at = ctx.now();
          if (row.updated_at == null) row.updated_at = row.created_at;
          hooks.beforeInsert?.(this.table, row, ctx);
          this.tableRows().push(row);
          written.push(row);
        }
        hooks.afterWrite?.(this.table, this.op, written, ctx);
        return this.returning(written);
      }
      if (this.op === 'update') {
        const targets = this.matchingBase();
        for (const r of targets) Object.assign(r, this.payload as Row, { updated_at: (this.payload as Row).updated_at ?? ctx.now() });
        hooks.afterWrite?.(this.table, 'update', targets, ctx);
        return this.returning(targets);
      }
      // delete
      const targets = new Set(this.matchingBase());
      const all = this.tableRows();
      this.client.db[this.table] = all.filter((r) => !targets.has(r));
      hooks.afterWrite?.(this.table, 'delete', [...targets], ctx);
      return this.returning([...targets]);
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : String(e) }, status: 400 };
    }
  }

  private returning(rows: Row[]): DemoResult {
    if (!this.wantReturn) {
      return { data: null, error: null, count: this.countMode ? rows.length : null, status: 201 };
    }
    const fields = this.selectFields ?? parseSelect('*');
    const projected = rows.map((r) => project(this.client.db, this.table, r, fields)).filter((r): r is Row => r !== null);
    return this.shape(projected, projected.length);
  }

  private shape(rows: Row[], total: number): DemoResult {
    const count = this.countMode ? total : null;
    if (this.head) return { data: null, error: null, count, status: 200 };
    if (this.singleMode === 'single') {
      if (rows.length !== 1) {
        return {
          data: null,
          error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' },
          count,
          status: 406,
        };
      }
      return { data: rows[0], error: null, count, status: 200 };
    }
    if (this.singleMode === 'maybe') {
      return { data: rows[0] ?? null, error: null, count, status: 200 };
    }
    return { data: rows, error: null, count, status: 200 };
  }

  then<TResult1 = DemoResult, TResult2 = never>(
    onfulfilled?: ((value: DemoResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const result = this.execute();
    this.client.log('from', this.table, this.op, result.error?.message);
    // Small delay so loading states render like the real app.
    return new Promise<DemoResult>((resolve) => setTimeout(() => resolve(structuredCloneSafe(result)), 40)).then(
      onfulfilled ?? undefined,
      onrejected ?? undefined,
    );
  }
}

function structuredCloneSafe<T>(v: T): T {
  try {
    return structuredClone(v);
  } catch {
    return JSON.parse(JSON.stringify(v)) as T;
  }
}

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------

type AuthListener = (event: string, session: unknown) => void;

class FakeAuth {
  private listeners = new Set<AuthListener>();

  constructor(private client: FakeSupabaseClient) {}

  session() {
    const u = this.client.user;
    if (!u) return null;
    return {
      access_token: `demo-token-${u.id}`,
      refresh_token: 'demo-refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: u.id,
        email: u.email,
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    };
  }

  emit(event: string) {
    const s = this.session();
    for (const l of this.listeners) l(event, s);
  }

  async getSession() {
    return { data: { session: this.session() }, error: null };
  }
  async getUser() {
    const s = this.session();
    return { data: { user: s?.user ?? null }, error: s ? null : { message: 'Auth session missing!' } };
  }
  onAuthStateChange(cb: AuthListener) {
    this.listeners.add(cb);
    setTimeout(() => cb('INITIAL_SESSION', this.session()), 0);
    return { data: { subscription: { unsubscribe: () => this.listeners.delete(cb) } } };
  }
  async signOut() {
    this.client.setUser(null);
    return { error: null };
  }
  async signInWithPassword() {
    return { data: null, error: { message: 'Demo: use the view switcher at the top of the page to sign in.' } };
  }
  async signInWithOtp() {
    return { data: null, error: { message: 'Demo: use the view switcher at the top of the page to sign in.' } };
  }
  async verifyOtp() {
    return { data: null, error: { message: 'Demo: use the view switcher at the top of the page to sign in.' } };
  }
  async signUp() {
    return { data: null, error: { message: 'Demo: sign-up is disabled.' } };
  }
  async exchangeCodeForSession() {
    return { data: { session: this.session() }, error: null };
  }
  async setSession() {
    return { data: { session: this.session() }, error: null };
  }
  async refreshSession() {
    return { data: { session: this.session() }, error: null };
  }
  async updateUser() {
    return { data: { user: this.session()?.user ?? null }, error: null };
  }
  async resetPasswordForEmail() {
    return { data: {}, error: null };
  }
}

// ---------------------------------------------------------------------------
// client
// ---------------------------------------------------------------------------

export interface FakeSupabaseOptions {
  tables: Tables;
  rpcs: Record<string, RpcHandler>;
  functions: Record<string, FunctionHandler>;
  hooks?: FakeHooks;
  debug?: boolean;
}

export class FakeSupabaseClient {
  db: Tables;
  user: DemoUser | null = null;
  auth: FakeAuth;
  hooks: FakeHooks;
  private rpcs: Record<string, RpcHandler>;
  private fns: Record<string, FunctionHandler>;
  private debug: boolean;
  private userListeners = new Set<() => void>();

  functions: { invoke: (name: string, opts?: { body?: unknown; headers?: Record<string, string> }) => Promise<{ data: unknown; error: DemoError | null }> };
  storage: {
    from: (bucket: string) => {
      upload: () => Promise<DemoResult>;
      remove: () => Promise<DemoResult>;
      createSignedUrl: () => Promise<DemoResult>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
      list: () => Promise<DemoResult>;
      download: () => Promise<DemoResult>;
    };
  };

  constructor(opts: FakeSupabaseOptions) {
    this.db = opts.tables;
    this.rpcs = opts.rpcs;
    this.fns = opts.functions;
    this.hooks = opts.hooks ?? {};
    this.debug = Boolean(opts.debug);
    this.auth = new FakeAuth(this);
    this.functions = {
      invoke: async (name, invokeOpts) => {
        await delay(250);
        const handler = this.fns[name];
        if (!handler) {
          this.hooks.onUnknown?.('function', name);
          this.log('fn', name, 'missing');
          return { data: null, error: { message: `Demo: "${name}" is not available in the demo.` } };
        }
        try {
          const raw = typeof invokeOpts?.body === 'string' ? JSON.parse(invokeOpts.body) : invokeOpts?.body ?? {};
          const body = { ...(raw as Row), __authorization: invokeOpts?.headers?.Authorization ?? null } as Row;
          const data = await handler(body, this.ctx());
          this.log('fn', name, 'ok');
          return { data: structuredCloneSafe(data), error: null };
        } catch (e) {
          this.log('fn', name, e instanceof Error ? e.message : String(e));
          return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
        }
      },
    };
    const okEmpty = async (): Promise<DemoResult> => ({ data: null, error: null });
    this.storage = {
      from: () => ({
        upload: async () => ({ data: { path: 'demo' }, error: null }),
        remove: okEmpty,
        createSignedUrl: async () => ({ data: { signedUrl: '#' }, error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: path } }),
        list: async () => ({ data: [], error: null }),
        download: okEmpty,
      }),
    };
  }

  /** Calls a function handler directly (used by the demo fetch shim). */
  async invokeRaw(name: string, body: Row): Promise<{ status: number; data: unknown }> {
    const handler = this.fns[name];
    if (!handler) return { status: 404, data: { error: `Demo: "${name}" is not available in the demo.` } };
    try {
      return { status: 200, data: await handler(body, this.ctx()) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { status: /expired|invalid/i.test(msg) ? 401 : 400, data: { error: msg } };
    }
  }

  ctx(): DemoContext {
    return { db: this.db, user: this.user, uuid, now: () => new Date().toISOString() };
  }

  log(kind: string, name: string, op: string, err?: string) {
    if (this.debug || err) {
      console.debug(`[demo] ${kind} ${name} ${op}${err ? ` ERROR: ${err}` : ''}`);
    }
  }

  setUser(user: DemoUser | null) {
    this.user = user;
    this.auth.emit(user ? 'SIGNED_IN' : 'SIGNED_OUT');
    for (const l of this.userListeners) l();
  }

  onUserChange(cb: () => void) {
    this.userListeners.add(cb);
    return () => this.userListeners.delete(cb);
  }

  from(table: string) {
    return new QueryBuilder(this, table);
  }

  schema() {
    return this;
  }

  async rpc(name: string, args: Row = {}) {
    await delay(120);
    const handler = this.rpcs[name];
    if (!handler) {
      this.hooks.onUnknown?.('rpc', name);
      this.log('rpc', name, 'missing');
      return { data: null, error: { message: `Could not find the function public.${name}`, code: 'PGRST202' } };
    }
    try {
      const data = await handler(args, this.ctx());
      this.log('rpc', name, 'ok');
      return { data: structuredCloneSafe(data), error: null };
    } catch (e) {
      const err = e instanceof DemoRpcError ? { message: e.message, code: e.code } : { message: e instanceof Error ? e.message : String(e) };
      this.log('rpc', name, 'error', err.message);
      return { data: null, error: err };
    }
  }

  channel() {
    const ch = {
      on: () => ch,
      subscribe: () => ch,
      unsubscribe: async () => 'ok',
    };
    return ch;
  }

  removeChannel() {
    return Promise.resolve('ok');
  }

  removeAllChannels() {
    return Promise.resolve([]);
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
