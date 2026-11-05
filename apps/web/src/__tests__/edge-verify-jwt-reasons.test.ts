/**
 * Every edge function that turns off Supabase's built-in sign-in check
 * (verify_jwt = false in supabase/config.toml) must say, in a comment in its
 * block, what it checks instead. A new public function then can't slip in
 * without someone writing down how it is protected.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const config = readFileSync(resolve(__dirname, '../../../../supabase/config.toml'), 'utf8');

const blocks = config
  .split(/^(?=\[)/m)
  .map((block) => ({ name: /^\[functions\.([a-z0-9-]+)\]/.exec(block)?.[1], block }))
  .filter((b): b is { name: string; block: string } => Boolean(b.name));

const unverified = blocks.filter((b) => /^verify_jwt = false/m.test(b.block));

describe('supabase/config.toml verify_jwt = false', () => {
  it('finds the functions', () => {
    expect(unverified.length).toBeGreaterThan(10);
  });

  it.each(unverified.map((b) => [b.name, b.block]))('%s says what it checks instead', (_name, block) => {
    const beforeFlag = block.split(/^verify_jwt = false/m)[0];
    expect(beforeFlag).toMatch(/^#\s*\S.{10,}/m);
  });
});
