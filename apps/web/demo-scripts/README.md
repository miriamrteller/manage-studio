# Demo scripts

These scripts check and publish the browser-only demos
(photographer: https://claude.ai/artifact/DgrRLWJjES7nNJjAEXuPfX).
The demo code itself lives in `apps/web/src/demo`.

## Build

    pnpm install --frozen-lockfile
    VITE_DEMO_MODE=true pnpm --filter web build      # output: apps/web/dist-demo

## Run the browser suites (Playwright, sandboxed iframe like the artifact)

    (cd apps/web/dist-demo && python3 -m http.server 4173) &
    (cd apps/web/demo-scripts/host && python3 -m http.server 4174) &
    cd apps/web/demo-scripts
    for w in 390 1280; do
      for f in full-sandbox quote-to-pay admin-gallery clients shopwalk newscreens; do node $f.cjs $w; done
    done

Crawl. The route list is the second column of crawl-routes.txt:

    R=$(grep '^ok' crawl-routes.txt | awk '{print $2}' | sort -u | grep -v '^#/portal$\|^#/dashboard/portal$' | paste -sd,)
    node crawl.cjs 390 admin "$R"
    node crawl.cjs 390 client '#/dashboard,#/portal,#/dashboard/portal'

Each suite should print PASS (or "external hrefs left: 0"). Every crawl line should start with "ok".
Don't stop the servers with `pkill -f "http.server 417"`: the pattern also matches the shell running it.

## Publish

1. Make the page: take every `<script>`, `<link rel="modulepreload">` and `<link rel="stylesheet">`
   tag from dist-demo/index.html and put them in a minimal page:
   - `<title>Lumen &amp; Light Demo</title>`;
   - `<style>body{background:#f8fafc;margin:0}</style>`;
   - `<div id="root"></div>`.
2. Compare dist-demo/assets (skip `.woff`; `.woff2` is kept) with the artifact's file list.
3. Upload the new assets first, then index.html.
4. Remove the stale assets.
5. Label the version "main <sha> (#PR)", using the main commit it was built from.
