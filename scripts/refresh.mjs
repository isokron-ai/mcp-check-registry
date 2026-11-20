#!/usr/bin/env node
// refresh.mjs [--write] [--pr]
// Re-scans every listed server and re-reads its ci/owner marks from its default branch.
// An entry file is rewritten only when something besides timestamps and the commit changed.
//   --write  write the changed files into this working tree (for local runs)
//   --pr     commit the changes to a new refresh/<date>-<run> branch and open ONE pull request in
//            this repository, closing older open refresh pull requests (the nightly workflow)
// It never comments, opens issues or writes anywhere outside this repository.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { github as makeGithub, commitFiles } from './lib/github.mjs';
import { REGISTRY_REPO } from './lib/constants.mjs';
import { scanRepo as realScan } from './scan.mjs';
import { verify as realVerify } from './verify.mjs';
import { buildEntry, entryText, listEntryFiles, materiallyChanged } from './entry.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Computes the refresh. Returns { changed: { file: text }, notes: [string], checked: n }.
 * Failures keep the stored values and become notes, so a transient error never drops a mark.
 */
export async function refresh({ root = ROOT, files = listEntryFiles(root), gh = makeGithub(), scan = realScan, verify = realVerify, read = (f) => readFileSync(join(root, f), 'utf8') } = {}) {
  const changed = {};
  const notes = [];
  for (const file of files) {
    const prev = JSON.parse(read(file));
    const [owner, repo] = prev.id.split('/');
    const full = owner + '/' + repo;
    let res;
    try { res = await scan({ owner, repo, path: prev.path }); } catch (e) { notes.push(prev.id + ': scan failed, kept the stored entry (' + String(e.message).slice(0, 200) + ')'); continue; }
    if (res.repo.id.toLowerCase() !== full.toLowerCase()) notes.push(prev.id + ': GitHub now names it ' + res.repo.id + '; the entry was not moved');
    let scanBlock = res.scan;
    if (res.scan.status !== 'ok' && prev.scan.status === 'ok') {
      notes.push(prev.id + ': no tool definitions found at ' + res.scan.commit.slice(0, 7) + ', kept the stored grades');
      scanBlock = prev.scan;
    }
    let marks;
    try { marks = await verify({ full: res.repo.id, branch: res.repo.defaultBranch, id: prev.id, path: prev.path, gh }); } catch (e) {
      notes.push(prev.id + ': ci/owner check failed, kept the stored marks (' + String(e.message).slice(0, 200) + ')');
      marks = { ci: prev.ci, owner: prev.owner };
    }
    const next = buildEntry({ fullName: full, path: prev.path, defaultBranch: res.repo.defaultBranch, scan: scanBlock, ci: marks.ci, owner: marks.owner, existing: prev });
    if (materiallyChanged(prev, next)) changed[file] = entryText(next);
  }
  return { changed, notes, checked: files.length };
}

export function prBody({ changed, notes, checked }) {
  const lines = ['Nightly refresh: ' + checked + ' entries checked, ' + Object.keys(changed).length + ' changed.', ''];
  for (const f of Object.keys(changed)) lines.push('- `' + f + '`');
  if (notes.length) { lines.push('', 'Notes:', ''); for (const x of notes) lines.push('- ' + x.replace(/[`<>@]/g, '')); }
  lines.push('', 'Before merging: `npm test` passes locally.');
  return lines.join('\n');
}

async function main(argv) {
  const write = argv.includes('--write');
  const pr = argv.includes('--pr');
  const gh = makeGithub();
  const result = await refresh({ gh });
  const body = prBody(result);
  process.stdout.write(body + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, body + '\n');
  if (write) for (const [f, t] of Object.entries(result.changed)) writeFileSync(join(ROOT, f), t);
  if (pr && Object.keys(result.changed).length) {
    const date = new Date().toISOString().slice(0, 10);
    const branch = 'refresh/' + date + '-' + (process.env.GITHUB_RUN_ID || Date.now());
    await commitFiles(gh, REGISTRY_REPO, { base: 'main', branch, files: result.changed, message: 'Nightly refresh ' + date });
    const created = await gh.createPull(REGISTRY_REPO, { title: 'Nightly refresh ' + date, head: branch, base: 'main', body });
    const open = (await gh.listPulls(REGISTRY_REPO, { state: 'open', per_page: '100' })) || [];
    for (const p of open) {
      if (p.number !== created.number && p.head && p.head.ref.startsWith('refresh/') && p.head.repo && p.head.repo.full_name === REGISTRY_REPO && p.user && p.user.login === 'github-actions[bot]') {
        await gh.createIssueComment(REGISTRY_REPO, p.number, 'Superseded by #' + created.number + '.');
        await gh.updatePull(REGISTRY_REPO, p.number, { state: 'closed' });
      }
    }
    process.stdout.write('opened #' + created.number + '\n');
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv).then((c) => { process.exitCode = c; }, (e) => { process.stderr.write('refresh: ' + e.message + '\n'); process.exitCode = 1; });
}
