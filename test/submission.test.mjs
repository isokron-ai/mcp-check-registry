import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, LABELS } from '../scripts/submission.mjs';
import { scanBlock, topFindings, ScanError } from '../scripts/scan.mjs';
import { COMMENT_MARKER } from '../scripts/lib/constants.mjs';
import { fakeGitHub, formBody, fixture, NOW } from './helpers.mjs';

const report = fixture('report-kronicle-lite.json');
const SHA = 'd'.repeat(40);
const event = (over = {}) => ({
  action: 'opened',
  issue: { number: 5, state: 'open', created_at: '2026-11-20T10:00:00Z', user: { login: 'acme-dev' }, labels: [{ name: 'submission' }], body: formBody(), ...over },
});
const okScan = async ({ owner, repo }) => ({
  repo: { id: owner + '/' + repo, owner, repo, defaultBranch: 'main', commit: SHA },
  scan: scanBlock(report, { commit: SHA, at: '2026-11-20T12:00:00Z' }),
  top: topFindings(report),
});
const noMarks = async () => ({ ci: { verified: false, checkedAt: '2026-11-20T12:00:00Z', workflow: '' }, owner: { verified: false, checkedAt: '2026-11-20T12:00:00Z', method: '' } });

test('a good submission opens one PR with the entry and replies with the results', async () => {
  const gh = fakeGitHub();
  const r = await handle(event(), { gh, scan: okScan, verify: noMarks, now: NOW });
  assert.equal(r.outcome, 'ok');
  assert.equal(r.file, 'servers/acme/weather-mcp.json');
  assert.equal(gh.state.pulls.length, 1);
  assert.equal(gh.state.pulls[0].head, 'submission/issue-5');
  assert.equal(gh.state.pulls[0].title, 'Add acme/weather-mcp');
  const tip = gh.state.refs['submission/issue-5'];
  const entry = JSON.parse(gh.state.trees[gh.state.commits[tip].tree]['servers/acme/weather-mcp.json']);
  assert.deepEqual(entry.submitted, { at: '2026-11-20T10:00:00Z', by: 'acme-dev', issue: 5 });
  assert.equal(entry.name, 'Weather MCP');
  assert.equal(entry.id, 'acme/weather-mcp');
  assert.equal(entry.defaultBranch, 'main');
  assert.match(gh.state.pulls[0].body, /utm_source=mcp-check-registry-bot&utm_medium=action/);
  assert.equal(gh.state.comments.length, 1);
  assert.ok(gh.state.comments[0].body.startsWith(COMMENT_MARKER));
  assert.match(gh.state.comments[0].body, /once #\d+ is merged/);
  assert.deepEqual([...gh.state.labels], [LABELS.ok]);
});

test('an edit updates the same comment and the same PR', async () => {
  const gh = fakeGitHub();
  await handle(event(), { gh, scan: okScan, verify: noMarks, now: NOW });
  const r = await handle(event({ body: formBody({ name: 'Weather MCP v2' }) }), { gh, scan: okScan, verify: noMarks, now: NOW });
  assert.equal(r.outcome, 'ok');
  assert.equal(gh.state.comments.length, 1);
  assert.equal(gh.state.pulls.length, 1);
  const tip = gh.state.refs['submission/issue-5'];
  assert.equal(JSON.parse(gh.state.trees[gh.state.commits[tip].tree]['servers/acme/weather-mcp.json']).name, 'Weather MCP v2');
  assert.deepEqual(gh.state.commits[tip].parents.length, 1, 'a plain commit on the branch, no force');
});

test('changing the repository in an edit drops the earlier entry from the branch', async () => {
  const gh = fakeGitHub();
  await handle(event(), { gh, scan: okScan, verify: noMarks, now: NOW });
  await handle(event({ body: formBody({ repository: 'https://github.com/acme/other-mcp' }) }), { gh, scan: okScan, verify: noMarks, now: NOW });
  const files = gh.state.trees[gh.state.commits[gh.state.refs['submission/issue-5']].tree];
  assert.deepEqual(Object.keys(files), ['servers/acme/other-mcp.json']);
});

test('a bad form gets a fix-it reply and no PR', async () => {
  const gh = fakeGitHub();
  let scanned = false;
  const r = await handle(event({ body: formBody({ repository: 'https://gitlab.com/acme/x', ticked: false }) }), { gh, scan: async () => { scanned = true; }, verify: noMarks });
  assert.equal(r.outcome, 'fix');
  assert.equal(scanned, false);
  assert.equal(gh.state.pulls.length, 0);
  assert.match(gh.state.comments[0].body, /needs a fix/);
  assert.deepEqual([...gh.state.labels], [LABELS.fix]);
});

test('no tool definitions: friendly reply with the tools-file route, no PR', async () => {
  const gh = fakeGitHub();
  const scan = async ({ owner, repo }) => ({ repo: { id: owner + '/' + repo, owner, repo, defaultBranch: 'main', commit: SHA }, scan: { status: 'no-tools', commit: SHA, error: 'no tool definitions found' }, top: [] });
  const r = await handle(event(), { gh, scan, verify: noMarks });
  assert.equal(r.outcome, 'no-tools');
  assert.equal(gh.state.pulls.length, 0);
  assert.match(gh.state.comments[0].body, /tools-file: tools\.json/);
  assert.match(gh.state.comments[0].body, /runs nothing/);
});

test('private repositories and checker failures get the right reply', async () => {
  const gh = fakeGitHub();
  const r1 = await handle(event(), { gh, scan: async () => { throw new ScanError('The repository acme/weather-mcp is not public.', 'private'); }, verify: noMarks });
  assert.equal(r1.outcome, 'fix');
  assert.match(gh.state.comments[0].body, /could not be read/);
  const r2 = await handle(event(), { gh, scan: async () => { throw new Error('socket hang up with secret detail'); }, verify: noMarks });
  assert.equal(r2.outcome, 'error');
  assert.ok(!gh.state.comments[0].body.includes('secret detail'), 'internal errors are not echoed');
  assert.deepEqual([...gh.state.labels], [LABELS.error]);
});

test('issues without the submission label, closed issues and PRs are skipped', async () => {
  const gh = fakeGitHub();
  for (const ev of [event({ labels: [] }), event({ state: 'closed' }), event({ pull_request: {} }), {}]) {
    assert.equal((await handle(ev, { gh, scan: okScan, verify: noMarks })).outcome, 'skipped');
  }
  assert.equal(gh.state.comments.length, 0);
});

test('a file already used by a different id is held for review', async () => {
  const other = JSON.stringify({ id: 'acme/weather-mcp', path: 'packages/x' });
  const gh = fakeGitHub({ files: { 'servers/acme/weather-mcp.json': other } });
  const r = await handle(event(), { gh, scan: okScan, verify: noMarks, now: NOW });
  assert.equal(r.outcome, 'conflict');
  assert.equal(gh.state.pulls.length, 0);
});

test('a planted marker in someone else\'s comment is not edited', async () => {
  const gh = fakeGitHub();
  gh.state.comments.push({ id: 1, body: COMMENT_MARKER + ' fake', user: { login: 'mallory' } });
  await handle(event(), { gh, scan: okScan, verify: noMarks, now: NOW });
  assert.equal(gh.state.comments.find((c) => c.id === 1).body, COMMENT_MARKER + ' fake');
  assert.equal(gh.state.comments.length, 2);
});

test('a folder submission goes to the slug file with id owner/repo', async () => {
  const gh = fakeGitHub();
  const r = await handle(event({ body: formBody({ path: 'packages/Weather_Server' }) }), { gh, scan: okScan, verify: noMarks, now: NOW });
  assert.equal(r.file, 'servers/acme/weather-mcp~packages-weather-server.json');
  const tip = gh.state.refs['submission/issue-5'];
  const entry = JSON.parse(gh.state.trees[gh.state.commits[tip].tree][r.file]);
  assert.equal(entry.id, 'acme/weather-mcp');
  assert.equal(entry.path, 'packages/Weather_Server');
  assert.equal(gh.state.pulls[0].title, 'Add acme/weather-mcp (packages/Weather_Server)');
});
