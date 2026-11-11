// Tests for scripts/build-icons.mjs (scripts/icons-source.mjs → public/icons.svg + index.html).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { build, usedIcons, symbol } from "../scripts/build-icons.mjs";
import { ICONS } from "../scripts/icons-source.mjs";

const PUBLIC = new URL("../public/", import.meta.url);

test("icons.svg and the home page's inline icons are up to date", () => {
  for (const [path, content] of Object.entries(build())) {
    assert.equal(readFileSync(path, "utf8"), content, `${path} is out of date: run npm run build:icons`);
  }
});

test("every icon a page uses exists", () => {
  for (const f of readdirSync(PUBLIC).filter((n) => n.endsWith(".html") || n.endsWith(".js"))) {
    for (const name of usedIcons(readFileSync(new URL(f, PUBLIC), "utf8"))) {
      assert.ok(ICONS[name], `${f} uses i-${name}, which is not in icons-source.mjs`);
    }
  }
});

test("symbols use the colour variables, with a plain colour if the gradient is missing", () => {
  const s = symbol("camera");
  assert.match(s, /fill:var\(--icon-fill,url\(#os-icon-grad\) #5B6CFF\)/);
  assert.match(s, /stroke:var\(--icon-detail,#fff\)/);
  assert.throws(() => symbol("nope"));
});
