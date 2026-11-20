import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refresh, prBody } from '../scripts/refresh.mjs';
import { buildEntry, entryText } from '../scripts/entry.mjs';
import { scanBlock, topFindings } from '../scripts/scan.mjs';
import { fixture } from './helpers.mjs';

const report = fixture('report-kronicle-lite.json');
const AT = '2026-11-20T12:00:00Z';
const LATER = '2026-11-21T03:00:00Z';
const marks = (v = false, at = AT) => ({
  ci: { verified: v, checkedAt: at, workflow: v ? '.github/workflows/mcp-check.yml' : '' },
  owner: { verified: false, checkedAt: at, method: '' },
});
const stored = buildEntry({
  fullName: 'acme/x', name: 'X', description: 'An MCP server.', submitted: { at: AT, by: 'acme', issue: 3 },
  scan: scanBlock(report, { commit: 'a'.repeat(40), at: AT }), ...marks(),
});
const files = ['servers/acme/x.json'];
const read = () => entryText(stored);
const scanAt = (commit) => async ({ owner, repo }) => ({ repo: { id: owner + '/' + repo, owner, repo, defaultBranch: 'main', commit }, scan: scanBlock(report, { commit, at: LATER }), top: topFindings(report) });

test('a new commit with the same grades and marks changes nothing', async () => {
  const r = await refresh({ files, read, gh: {}, scan: scanAt('b'.repeat(40)), verify: async () => marks(false, LATER) });
  assert.deepEqual(r.changed, {});
  assert.deepEqual(r.notes, []);
});

test('a new CI workflow rewrites the entry, keeping the submission record', async () => {
  const r = await refresh({ files, read, gh: {}, scan: scanAt('b'.repeat(40)), verify: async () => marks(true, LATER) });
  const e = JSON.parse(r.changed['servers/acme/x.json']);
  assert.equal(e.ci.verified, true);
  assert.equal(e.ci.checkedAt, LATER);
  assert.deepEqual(e.submitted, stored.submitted);
  assert.equal(e.name, 'X');
});

test('scan and verify failures keep the stored values and leave a note', async () => {
  const r1 = await refresh({ files, read, gh: {}, scan: async () => { throw new Error('HTTP 502'); }, verify: async () => marks(true) });
  assert.deepEqual(r1.changed, {});
  assert.match(r1.notes[0], /scan failed/);
  const r2 = await refresh({ files, read, gh: {}, scan: scanAt('b'.repeat(40)), verify: async () => { throw new Error('HTTP 403'); } });
  assert.deepEqual(r2.changed, {});
  assert.match(r2.notes[0], /kept the stored marks/);
});

test('a graded entry that suddenly has no tools keeps its grades', async () => {
  const scan = async ({ owner, repo }) => ({ repo: { id: owner + '/' + repo, owner, repo, defaultBranch: 'main', commit: 'b'.repeat(40) }, scan: { status: 'no-tools', commit: 'b'.repeat(40), error: 'x' }, top: [] });
  const r = await refresh({ files, read, gh: {}, scan, verify: async () => marks(false, LATER) });
  assert.deepEqual(r.changed, {});
  assert.match(r.notes[0], /kept the stored grades/);
});

test('a renamed repository is noted, not moved', async () => {
  const scan = async () => ({ repo: { id: 'acme/x-renamed', owner: 'acme', repo: 'x-renamed', defaultBranch: 'main', commit: 'b'.repeat(40) }, scan: scanBlock(report, { commit: 'b'.repeat(40), at: LATER }), top: [] });
  const r = await refresh({ files, read, gh: {}, scan, verify: async () => marks(false, LATER) });
  assert.match(r.notes[0], /now names it acme\/x-renamed/);
});

test('the PR body lists changed files and strips mentions and markup from notes', () => {
  const b = prBody({ changed: { 'servers/acme/x.json': '{}' }, notes: ['acme/x: @someone <b>`x`</b>'], checked: 3 });
  assert.match(b, /3 entries checked, 1 changed/);
  assert.ok(!/[@<>]/.test(b.split('Notes:')[1]));
});
