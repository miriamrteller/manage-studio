/**
 * WebM → MP4 transcode. Playwright records WebM only; the case study wants MP4.
 * Prefers ffmpeg on PATH, falls back to the ffmpeg binary Playwright ships
 * inside the ms-playwright registry ("ffmpeg-<build>" directories). If neither
 * exists the WebM is kept and a warning is printed — the capture still succeeds.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function playwrightFfmpeg() {
  const registry =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    (process.platform === 'win32'
      ? join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
      : join(process.env.HOME ?? '', '.cache', 'ms-playwright'));
  if (!existsSync(registry)) return null;
  const dirs = readdirSync(registry).filter((d) => d.startsWith('ffmpeg'));
  for (const dir of dirs.sort().reverse()) {
    for (const bin of ['ffmpeg-win64.exe', 'ffmpeg-linux', 'ffmpeg-mac', 'ffmpeg']) {
      const candidate = join(registry, dir, bin);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function findFfmpeg() {
  // 1) Full build from the repo's ffmpeg-static devDependency.
  try {
    const req = createRequire(join(repoRoot, 'package.json'));
    const staticPath = req('ffmpeg-static');
    if (staticPath && existsSync(staticPath)) return staticPath;
  } catch {
    /* not installed */
  }
  // 2) Whatever is on PATH.
  const onPath = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', shell: true });
  if (onPath.status === 0) return 'ffmpeg';
  // 3) Playwright's bundled binary (minimal VP8 build — last resort).
  return playwrightFfmpeg();
}

/** @returns {string|null} path to the MP4, or null if no ffmpeg was found */
export function transcodeToMp4(webmPath, mp4Path) {
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) {
    console.warn(`ffmpeg not found — keeping WebM only: ${webmPath}`);
    return null;
  }
  const result = spawnSync(
    ffmpeg,
    [
      '-y',
      '-i', webmPath,
      '-c:v', 'libx264',
      '-preset', 'slow',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-movflags', '+faststart',
      '-an',
      mp4Path,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'], shell: ffmpeg === 'ffmpeg' },
  );
  if (result.status !== 0) {
    console.warn(`ffmpeg transcode failed (${result.status}): ${result.stderr?.toString().slice(-500)}`);
    return null;
  }
  return mp4Path;
}
