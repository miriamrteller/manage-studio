import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact, toMarkdown, classifiedNames } from './definer-drift.mjs';

test('classified names come from every tier', () => {
  const n = classifiedNames();
  for (const f of ['get_tenant_config_by_subdomain', 'save_quote', 'sign_waiver', 'get_app_encryption_key']) assert.ok(n.has(f), f);
});
test('redact hides token-like literals and URLs, keeps code', () => {
  const out = redact("x := 'sb_secret_abcdefghijklmnop'; y := 'QWxhZGRpbjpvcGVuIHNlc2FtZQ0K1234567890'; u := postgres://u:p@h/db; ALTER TABLE t ENABLE ROW LEVEL SECURITY;");
  assert.doesNotMatch(out, /sb_secret_abc|QWxhZGRpbjpv|u:p@h/);
  assert.match(out, /ENABLE ROW LEVEL SECURITY/);
});
test('markdown says what uses each function', () => {
  const md = toMarkdown('dev', [{ signature: 'handle_new_user_v2()', owner: 'postgres', returns: 'trigger', table_triggers: null, event_triggers: null, body: 'BEGIN\nRETURN NEW;\nEND;' }]);
  assert.match(md, /handle_new_user_v2\(\)/);
  assert.match(md, /nothing \(no trigger or event trigger\)/);
  assert.equal(toMarkdown('prod', []).includes('none'), true);
});
