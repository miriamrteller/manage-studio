/**
 * In-memory stand-in for the Supabase service client, just enough for the Grow payment code:
 * filtered select / insert / update on a few tables, plus the RPCs Grow calls. No network.
 */
type Row = Record<string, unknown>;

export interface GrowFakeOptions {
  /** Active webhook keys returned by get_grow_webhook_secret (newest first). */
  webhookKeys?: string[];
  tables?: Record<string, Row[]>;
}

export function makeGrowFakeService(options: GrowFakeOptions = {}) {
  const tables: Record<string, Row[]> = {
    payments: [],
    audit_log: [],
    engagements: [],
    people: [],
    tenants: [],
    payment_method_tokens: [],
    ...structuredClone(options.tables ?? {}),
  };
  const rpcCalls: { name: string; args: unknown }[] = [];

  function query(table: string) {
    const filters: ((row: Row) => boolean)[] = [];
    let op: 'select' | 'update' | 'insert' = 'select';
    let patch: Row = {};
    let inserted: Row[] = [];
    let returning = false;

    const rows = () => (tables[table] ??= []);
    const matches = () => rows().filter((row) => filters.every((f) => f(row)));

    const run = (): Row[] => {
      if (op === 'insert') return inserted;
      if (op === 'update') {
        const hit = matches();
        for (const row of hit) Object.assign(row, patch);
        return hit;
      }
      return matches();
    };

    const builder: Record<string, unknown> = {
      select: () => {
        if (op !== 'select') returning = true;
        return builder;
      },
      insert: (values: Row | Row[]) => {
        op = 'insert';
        inserted = (Array.isArray(values) ? values : [values]).map((v) => ({
          id: `${table}-${rows().length + 1}`,
          ...v,
        }));
        rows().push(...inserted);
        return builder;
      },
      update: (values: Row) => {
        op = 'update';
        patch = values;
        return builder;
      },
      eq: (col: string, val: unknown) => {
        filters.push((row) => row[col] === val);
        return builder;
      },
      in: (col: string, vals: unknown[]) => {
        filters.push((row) => vals.includes(row[col]));
        return builder;
      },
      is: (col: string, val: unknown) => {
        filters.push((row) => (row[col] ?? null) === val);
        return builder;
      },
      single: async () => {
        const [row] = run();
        return row ? { data: row, error: null } : { data: null, error: { message: 'not found' } };
      },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: returning || op === 'select' ? run() : (run(), null), error: null }).then(
          resolve,
          reject,
        ),
    };
    return builder;
  }

  const service = {
    from: (table: string) => query(table),
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      if (name === 'get_grow_webhook_secret') {
        return { data: (options.webhookKeys ?? []).map((k) => ({ webhook_secret: k })), error: null };
      }
      if (name === 'get_tenant_payment_credentials') {
        return {
          data: [{ payment_provider_public_key: 'page_code_123', payment_provider_secret_key: 'api_key' }],
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };

  return { service: service as never, tables, rpcCalls };
}
