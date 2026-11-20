import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanBlock, topFindings, scanRepo, ScanError, CHECKER_VERSION } from '../scripts/scan.mjs';
import { fixture, NOW } from './helpers.mjs';

const SHA = 'c'.repeat(40);
const report = fixture('report-kronicle-lite.json');

function fakeGh({ repo = { full_name: 'isokron-ai/kronicle-lite', default_branch: 'main', private: false, visibility: 'public' }, sha = SHA } = {}) {
  return { getRepo: async () => repo, getBranchHead: async () => sha };
}

test('the scan block carries grades, counts, hash and versions', () => {
  const s = scanBlock(report, { commit: SHA, at: '2026-11-20T12:00:00Z' });
  assert.deepEqual(s.grades, { spec: 'A', anthropic: 'B', openai: 'C', security: 'A', quality: 'A', surface: 'F' });
  assert.equal(s.tools, 13);
  assert.equal(s.checker, CHECKER_VERSION);
  assert.equal(s.rubric, '2.1.0');
  assert.equal(s.status, 'ok');
  assert.equal(s.fidelity, 'derived');
  assert.equal(s.catalogHash, 'sha256:' + report.input.catalogHash);
  const all = report.tools.flatMap((t) => t.findings).concat(report.server);
  assert.equal(s.findings.high + s.findings.medium + s.findings.low, all.length);
  assert.equal(s.findings.high, all.filter((f) => f.severity === 'blocking').length);
});

test('a server without write tools gets a null surface grade', () => {
  const r = structuredClone(report);
  r.sections.surface.grade = null;
  assert.equal(scanBlock(r, { commit: SHA, at: 'x' }).grades.surface, null);
});

test('top findings: at most five, blocking first, grouped by check', () => {
  const top = topFindings(report);
  assert.ok(top.length <= 5);
  const rank = { blocking: 0, attention: 1, advice: 2 };
  for (let i = 1; i < top.length; i++) assert.ok(rank[top[i - 1].severity] <= rank[top[i].severity]);
  assert.equal(new Set(top.map((t) => t.id)).size, top.length);
  assert.equal(top[0].id, 'openai-hints-explicit');
  assert.ok(top.every((t) => t.severity !== 'advice'));
});

test('advice shows only when nothing more serious exists; bad ids are dropped', () => {
  const r = { tools: [{ name: 't', findings: [{ id: 'quality-x', severity: 'advice', title: 'X', tool: 't' }, { id: '../evil', severity: 'blocking', title: 'E', tool: 't' }] }], server: [] };
  assert.deepEqual(topFindings(r).map((f) => f.id), ['quality-x']);
});

test('scanRepo reads at the pinned commit and builds the result', async () => {
  let ref;
  const res = await scanRepo({ owner: 'isokron-ai', repo: 'kronicle-lite', gh: fakeGh(), now: NOW, run: async (r) => { ref = r; return { code: 0, stdout: JSON.stringify(report), stderr: '' }; } });
  assert.equal(ref, 'https://github.com/isokron-ai/kronicle-lite/tree/' + SHA);
  assert.equal(res.scan.commit, SHA);
  assert.equal(res.scan.at, '2026-11-20T12:00:00Z');
  assert.equal(res.repo.defaultBranch, 'main');
  assert.ok(res.top.length);
});

test('scanRepo passes a subfolder on', async () => {
  let ref;
  await scanRepo({ owner: 'a', repo: 'b', path: 'packages/x', gh: fakeGh({ repo: { full_name: 'a/b', default_branch: 'dev', private: false } }), now: NOW, run: async (r) => { ref = r; return { code: 0, stdout: JSON.stringify(report), stderr: '' }; } });
  assert.equal(ref, 'https://github.com/a/b/tree/' + SHA + '/packages/x');
});

test('no tool definitions is a result, not a failure', async () => {
  const res = await scanRepo({ owner: 'a', repo: 'b', gh: fakeGh(), now: NOW, run: async () => ({ code: 3, stdout: '', stderr: 'mcp-check: no tool definitions found in a/b (scanned 4 of 4 source files). Run the server and use --command or --url.\n' }) });
  assert.equal(res.scan.status, 'no-tools');
  assert.equal(res.scan.grades, null);
  assert.equal(res.scan.error, 'no tool definitions found in a/b (scanned 4 of 4 source files).');
});

test('missing, private and unreadable repositories throw ScanError', async () => {
  const run = async () => ({ code: 0, stdout: '{}', stderr: '' });
  await assert.rejects(scanRepo({ owner: 'a', repo: 'b', gh: { getRepo: async () => null }, run }), (e) => e instanceof ScanError && e.code === 'not-found');
  await assert.rejects(scanRepo({ owner: 'a', repo: 'b', gh: fakeGh({ repo: { full_name: 'a/b', private: true, default_branch: 'main' } }), run }), (e) => e.code === 'private');
  await assert.rejects(scanRepo({ owner: 'a', repo: 'b', gh: fakeGh(), run: async () => ({ code: 3, stdout: '', stderr: 'mcp-check: could not read a/b: HTTP 403\n' }) }), (e) => e.code === 'checker' && /HTTP 403/.test(e.message));
  await assert.rejects(scanRepo({ owner: 'a', repo: 'b', gh: fakeGh(), run: async () => ({ code: 0, stdout: 'not json', stderr: '' }) }), (e) => e.code === 'checker');
  await assert.rejects(scanRepo({ owner: 'a', repo: 'b', gh: fakeGh({ sha: 'main' }), run }), (e) => e.code === 'checker');
});

test('a multi-line checker message becomes one clean line in the no-tools block', async () => {
  const res = await scanRepo({ owner: 'a', repo: 'b', gh: fakeGh(), now: NOW, run: async () => ({ code: 3, stdout: '', stderr: 'mcp-check: no tool definitions found in a/b\u0007 (scanned 1 of 1 source files).\n' }) });
  assert.equal(res.scan.error, 'no tool definitions found in a/b (scanned 1 of 1 source files).');
});
