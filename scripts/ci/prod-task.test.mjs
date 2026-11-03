import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFileName, checkSql, report, stripSql } from './prod-task.mjs';

test('file names: UTC timestamp + snake_case', () => {
  assert.deepEqual(checkFileName('20261103121500_fix_lead_status.sql'), []);
  assert.equal(checkFileName('fix.sql').length, 1);
  assert.equal(checkFileName('20261103121500-fix.sql').length, 1);
  assert.equal(checkFileName('20261103121500_Fix.sql').length, 1);
  assert.match(checkFileName('20261332121500_fix.sql')[0], /not a real UTC timestamp/);
});

test('data statements pass', () => {
  const sql = `
    -- Why: lead 42 was imported twice (ticket #12). Drop the copy.
    SET LOCAL statement_timeout = '30s';
    UPDATE public.leads SET status = 'closed' WHERE id = '00000000-0000-0000-0000-000000000042';
    DELETE FROM public.leads WHERE note = 'drop table; begin; \\o x';
    INSERT INTO public.verticals (id, name) VALUES ('x', 'X') ON CONFLICT DO NOTHING;
    WITH d AS (DELETE FROM public.x WHERE false RETURNING 1) SELECT count(*) FROM d;
    DO $$ BEGIN UPDATE public.x SET y = 1; END $$;
    SELECT "create" FROM public.t;
  `;
  assert.deepEqual(checkSql(sql), []);
});

test('schema changes are refused', () => {
  assert.match(checkSql('ALTER TABLE public.x ADD COLUMN y int;')[0], /migrations/);
  assert.match(checkSql('create index on x(y);')[0], /migrations/);
  assert.match(checkSql('GRANT SELECT ON x TO anon;')[0], /migrations/);
  assert.match(checkSql('DO $body$ BEGIN DROP TABLE x; END $body$;').join(), /contains "DROP"/i);
  assert.match(checkSql("DO $$ BEGIN EXECUTE 'drop table x'; END $$;").join(), /EXECUTE/);
});

test('comments and strings inside a DO block do not trip the check', () => {
  assert.deepEqual(checkSql("DO $$ BEGIN -- create the missing row\n INSERT INTO x VALUES ('drop'); END $$;"), []);
});

test('transaction control and psql meta-commands are refused', () => {
  assert.match(checkSql('BEGIN; UPDATE x SET y = 1; COMMIT;').join(), /one transaction/);
  assert.match(checkSql('UPDATE x SET y = 1;\n\\o /tmp/out').join(), /backslash/);
  assert.match(checkSql('SELECT 1 \\gexec').join(), /backslash/);
  assert.match(checkSql("SELECT E'\\'' \\gexec").join(), /backslash/);
  assert.deepEqual(checkSql("SELECT E'a\\nb', 'c\\d';"), []);
  assert.match(checkSql('SET search_path = x;').join(), /SET LOCAL/);
  assert.match(checkSql('COPY x FROM PROGRAM \'id\';').join(), /not allowed/);
  assert.match(checkSql('   -- nothing\n').join(), /no SQL statements/);
});

test('stripSql keeps code, drops strings, comments and $$ bodies', () => {
  const { code, bodies } = stripSql("SELECT 'a;b' /* c; */ , $q$ d; $q$ -- e;\n;");
  assert.equal(code.split(';').length, 2);
  assert.deepEqual(bodies, [' d; ']);
});

test('report shows row counts and SQLSTATEs, never data', () => {
  const stdout = ['UPDATE 3', ' id | email ', '----+-------', ' 1 | a@b.example', '(1 row)', 'DELETE 0', 'INSERT 0 2'].join('\n');
  const stderr = [
    'psql:/tmp/task.sql:4: ERROR:  23505',
    'DETAIL:  Key (email)=(a@b.example) already exists.',
    'psql: error: connection to server at "h" failed: FATAL: password authentication failed',
  ].join('\n');
  const r = report(stdout, stderr);
  assert.deepEqual(r.lines, ['1. UPDATE 3', '2. returned 1 row(s) (not shown)', '3. DELETE 0', '4. INSERT 0 2']);
  assert.equal(r.hidden, 3);
  assert.deepEqual(r.errors, ['ERROR SQLSTATE 23505 (unique violation)', 'could not connect to the database']);
  assert.equal(r.hiddenErr, 1);
  assert.ok(!JSON.stringify(r).includes('a@b.example'));
});
