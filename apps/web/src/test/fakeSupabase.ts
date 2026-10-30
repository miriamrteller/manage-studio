/**
 * Minimal in-memory stand-in for the supabase-js query builder, for unit tests
 * of edge-function modules. Supports the chain subset those modules use:
 * from().select()/update()/insert() + eq/neq/in/is/not/filter/lt/lte/gt/gte/
 * or/order/limit + maybeSingle/single/await.
 */
type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export interface FakeDb {
  tables: Record<string, Row[]>;
  log: Array<{ table: string; op: 'insert' | 'update'; payload: Row }>;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function jsonPath(row: Row, path: string): unknown {
  // "after_state->>payment_id" → row.after_state.payment_id (as string)
  const [col, key] = path.split('->>');
  const obj = row[col];
  if (!key) return obj;
  if (obj && typeof obj === 'object') {
    const v = (obj as Row)[key];
    return v == null ? null : String(v);
  }
  return null;
}

class Query implements PromiseLike<{ data: unknown; error: null }> {
  private filters: Filter[] = [];
  private op: 'select' | 'update' | 'insert' = 'select';
  private payload: Row | Row[] | null = null;
  private limitN: number | null = null;
  private orderKey: string | null = null;
  private orderAsc = true;
  private wantSelect = false;
  private wantCount = false;

  constructor(private db: FakeDb, private table: string) {}

  select(cols?: string, opts?: { count?: string; head?: boolean }) {
    void cols;
    this.wantSelect = true;
    if (opts?.count) this.wantCount = true;
    return this;
  }
  update(payload: Row) {
    this.op = 'update';
    this.payload = payload;
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => r[col] === v);
    return this;
  }
  neq(col: string, v: unknown) {
    this.filters.push((r) => r[col] !== v);
    return this;
  }
  in(col: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[col]));
    return this;
  }
  is(col: string, v: unknown) {
    this.filters.push((r) => (v === null ? r[col] == null : r[col] === v));
    return this;
  }
  not(col: string, op: string, v: unknown) {
    if (op === 'is' && v === null) this.filters.push((r) => r[col] != null);
    return this;
  }
  filter(path: string, op: string, v: unknown) {
    if (op === 'eq') this.filters.push((r) => jsonPath(r, path) === v);
    return this;
  }
  lt(col: string, v: string | number) {
    this.filters.push((r) => (r[col] as string | number) < v);
    return this;
  }
  lte(col: string, v: string | number) {
    this.filters.push((r) => (r[col] as string | number) <= v);
    return this;
  }
  gt(col: string, v: string | number) {
    this.filters.push((r) => (r[col] as string | number) > v);
    return this;
  }
  gte(col: string, v: string | number) {
    this.filters.push((r) => (r[col] as string | number) >= v);
    return this;
  }
  or() {
    // OR-filters are not modelled; callers pre-filter in tests.
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderKey = col;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }

  private rows(): Row[] {
    const all = this.db.tables[this.table] ?? (this.db.tables[this.table] = []);
    let out = all.filter((r) => this.filters.every((f) => f(r)));
    if (this.orderKey) {
      const k = this.orderKey;
      out = [...out].sort((a, b) => {
        const av = a[k] as string | number;
        const bv = b[k] as string | number;
        return (av < bv ? -1 : av > bv ? 1 : 0) * (this.orderAsc ? 1 : -1);
      });
    }
    if (this.limitN != null) out = out.slice(0, this.limitN);
    return out;
  }

  private execute(): Row[] {
    if (this.op === 'select') return this.rows();
    if (this.op === 'update') {
      const targets = this.rows();
      for (const r of targets) Object.assign(r, this.payload as Row);
      this.db.log.push({ table: this.table, op: 'update', payload: this.payload as Row });
      return targets;
    }
    const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
    const inserted = list.map((p) => {
      const row: Row = { id: nextId(this.table), ...p };
      (this.db.tables[this.table] ??= []).push(row);
      this.db.log.push({ table: this.table, op: 'insert', payload: row });
      return row;
    });
    return inserted;
  }

  async maybeSingle() {
    const rows = this.execute();
    return { data: rows[0] ?? null, error: null };
  }
  async single() {
    const rows = this.execute();
    return rows[0]
      ? { data: rows[0], error: null }
      : { data: null, error: { message: `${this.table}: no row`, code: 'PGRST116' } };
  }
  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const rows = this.execute();
    const value = this.wantCount
      ? { data: null, error: null, count: rows.length }
      : { data: this.wantSelect || this.op === 'select' ? rows : null, error: null };
    return Promise.resolve(value).then(onfulfilled ?? undefined, onrejected ?? undefined);
  }
}

export function makeFakeSupabase(seed: Record<string, Row[]> = {}) {
  const db: FakeDb = { tables: structuredClone(seed), log: [] };
  const client = {
    from: (table: string) => new Query(db, table),
    rpc: async () => ({ data: null, error: null }),
  };
  return { db, client };
}
