#!/usr/bin/env node
// seed.mjs <owner/repo> --name "..." --description "..." [--path p] [--by login]
// Adds or updates an entry directly, without a submission issue (submitted.issue is null).
// For IsoKron's own servers. Writes servers/<owner>/<repo>.json in this working tree and prints a summary.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanRepo } from './scan.mjs';
import { verify } from './verify.mjs';
import { buildEntry, entryFile, entryId, entryText } from './entry.mjs';
import { parsePath } from './lib/form.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const m = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(args[0] || '');
const p = parsePath(opt('--path', ''));
if (!m || !opt('--name') || !opt('--description') || p.error) {
  process.stderr.write('usage: seed.mjs <owner/repo> --name "..." --description "..." [--path p] [--by login]\n');
  process.exit(2);
}
const res = await scanRepo({ owner: m[1], repo: m[2], path: p.path });
const id = entryId(res.repo.id);
const marks = await verify({ full: res.repo.id, branch: res.repo.defaultBranch, id, path: p.path });
const file = entryFile(res.repo.id, p.path);
const existing = existsSync(join(ROOT, file)) ? JSON.parse(readFileSync(join(ROOT, file), 'utf8')) : null;
const entry = buildEntry({
  fullName: res.repo.id,
  path: p.path,
  defaultBranch: res.repo.defaultBranch,
  name: opt('--name'),
  description: opt('--description'),
  submitted: { at: res.scan.at, by: opt('--by', 'rafe-walker'), issue: null },
  scan: res.scan,
  ci: marks.ci,
  owner: marks.owner,
  existing,
});
mkdirSync(dirname(join(ROOT, file)), { recursive: true });
writeFileSync(join(ROOT, file), entryText(entry));
process.stdout.write(JSON.stringify({ file, status: res.scan.status, error: res.scan.error, tools: res.scan.tools, grades: res.scan.grades, findings: res.scan.findings, ci: marks.ci.verified, owner: marks.owner.verified, top: res.top.map((t) => t.id) }) + '\n');
