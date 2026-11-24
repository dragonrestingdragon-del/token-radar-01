// Token Launch Radar — entrypoint (Node 22, standard library only).
//
// Written for make.fun's token-radar-01 bounty. The program:
//   1. reads the sealed DefiLlama snapshot (default /input/snapshot.json,
//      override with --input <file|dir>),
//   2. ranks the pre-token protocols with the peer-multiple model in
//      lib/model.ts and validates the board before writing anything,
//   3. writes /output/board.json and the dashboard's /output/data.js,
//   4. copies dashboard/ and screenshots/ into the output, checking the
//      screenshot gate (count, names, per-file size) as it goes,
//   5. writes /output/dossier.json last, with the vendored make.fun
//      library, because the scorer rebuilds it from the same output
//      directory and compares bytes.
//
// For a local run, MAKEFUN_OUTPUT_DIR stands in for /output:
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json

import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));

// The scorer's caps, mirrored here so a bad hand-in fails locally first.
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function fail(message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(1);
}

/** Read `--name value` or `--name=value` from argv, else the fallback. */
function readArg(name: string, fallback: string): string {
  const flag = `--${name}`;
  const at = process.argv.indexOf(flag);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const inline = process.argv.find((a) => a.startsWith(`${flag}=`));
  return inline === undefined ? fallback : inline.slice(flag.length + 1);
}

// --- Locate and load the snapshot -------------------------------------------

const inputArg = readArg('input', '/input');
const snapshotPath = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(snapshotPath)) {
  fail(`no snapshot at ${snapshotPath}: pass --input <snapshot.json|directory> or mount the sealed /input`);
}
const outputDir = readArg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const { board, radar } = buildRadar(snapshot);

// --- Validate the board with our own checks, not only the gate's ------------

const gateIssue = boardIssue(board, snapshot);
if (gateIssue !== null) fail(`the model wrote a board the gate refuses: ${gateIssue}`);

for (let i = 0; i < board.length; i++) {
  const row = board[i]!;
  if (row.rank !== i + 1) fail(`board row ${i} carries rank ${row.rank}: ranks must run 1..N in order`);
  if (i > 0 && row.implied_value_usd > board[i - 1]!.implied_value_usd) {
    fail(`board is not sorted: rank ${row.rank} (${row.slug}) is worth more than rank ${i}`);
  }
}
const watchlistOnBoard = new Set(board.filter((r) => r.watchlist).map((r) => r.slug));
for (const slug of snapshot.watchlist) {
  if (!watchlistOnBoard.has(slug)) fail(`watchlist protocol ${slug} is missing from the board`);
}

// --- Write the board and the dashboard data ---------------------------------

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outputDir, 'data.js'), dataScript(radar));

/**
 * Copy a directory's regular files into the output and make sure every
 * copied file stays readable by the collector (mode 0644), whatever the
 * repository's umask was. Returns the copied file names.
 */
function copyInto(fromDir: string, toDir: string): string[] {
  if (!existsSync(fromDir)) return [];
  mkdirSync(toDir, { recursive: true });
  chmodSync(toDir, 0o755);
  const copied: string[] = [];
  for (const name of readdirSync(fromDir).sort()) {
    if (name.startsWith('.')) continue;
    const from = join(fromDir, name);
    if (!statSync(from).isFile()) continue;
    const to = join(toDir, name);
    copyFileSync(from, to);
    chmodSync(to, 0o644);
    copied.push(name);
  }
  return copied;
}

const dashboardFiles = copyInto(join(repoDir, 'dashboard'), join(outputDir, 'dashboard'));
if (dashboardFiles.length === 0) fail('dashboard/ is empty: the judge reads the copied page, not the repo');

const shots = copyInto(join(repoDir, 'screenshots'), join(outputDir, 'screenshots'));
if (shots.length < 3) {
  fail(`screenshots/ holds ${shots.length} image(s): hand in 3 — the board, a detail view and a filtered view`);
}
if (shots.length > SCREENSHOT_CAPS.max) {
  fail(`screenshots/ holds ${shots.length} images: the gate allows at most ${SCREENSHOT_CAPS.max}`);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) fail(`screenshots/${name}: names are letters, digits and . _ -, 1 to 128 characters`);
  const size = statSync(join(outputDir, 'screenshots', name)).size;
  if (size > SCREENSHOT_CAPS.max_bytes) {
    fail(`screenshots/${name} is ${size} bytes: the gate allows at most ${SCREENSHOT_CAPS.max_bytes}`);
  }
}

// --- The dossier goes last: the scorer rebuilds and compares it -------------

writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: SCREENSHOT_CAPS,
    dashboard: DASHBOARD_CAPS,
  }),
);

const top = board.slice(0, 3).map((r) => `#${r.rank} ${r.name} $${Math.round(r.implied_value_usd / 1e6)}M`).join(', ');
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ` +
    `${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: top of the board: ${top}\n` +
    `token radar: wrote board.json, data.js, dashboard/ (${dashboardFiles.length} files), ` +
    `screenshots/ (${shots.length} images) and dossier.json under ${outputDir}\n`,
);
