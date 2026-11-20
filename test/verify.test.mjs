import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verify, usesMcpCheck, claimNames } from '../scripts/verify.mjs';
import { github } from '../scripts/lib/github.mjs';
import { mockFetch, NOW } from './helpers.mjs';

const API = 'https://api.github.com/repos/acme/x/contents/';
const dir = (...names) => ({ body: names.map((name) => ({ name, type: 'file' })) });
const ghWith = (routes, calls) => github({ token: 'test-token', fetch: mockFetch(routes, calls) });

test('the uses: matcher needs a real step, not a comment or another action', () => {
  assert.ok(usesMcpCheck('    steps:\n      - uses: isokron-ai/mcp-check@v1\n'));
  assert.ok(usesMcpCheck('      - name: grade\n        uses: "isokron-ai/mcp-check@' + 'a'.repeat(40) + '" # v1.1.0\n'));
  assert.ok(usesMcpCheck("        uses: 'Isokron-AI/MCP-Check@v1'\n"));
  assert.ok(!usesMcpCheck('      # - uses: isokron-ai/mcp-check@v1\n'));
  assert.ok(!usesMcpCheck('      - uses: isokron-ai/mcp-checker@v1\n'));
  assert.ok(!usesMcpCheck('      - uses: isokron-ai/mcp-writecheck-action@v1\n'));
  assert.ok(!usesMcpCheck('      - run: echo "uses: isokron-ai/mcp-check@v1"\n'));
  assert.ok(!usesMcpCheck('      - uses: isokron-ai/mcp-check\n'));
});

test('claim files: {"id"} for the repository, plus "path" for a folder listing', () => {
  assert.ok(claimNames('{"id":"acme/x"}', 'acme/x'));
  assert.ok(claimNames('{"id":"Acme/X"}', 'acme/x'));
  assert.ok(claimNames('{"id":"acme/x","path":""}', 'acme/x'));
  assert.ok(claimNames('{"id":"acme/x","path":"packages/server"}', 'acme/x', 'packages/server'));
  assert.ok(claimNames('{"id":"acme/x","path":"./packages/server/"}', 'acme/x', 'packages/server'));
  assert.ok(!claimNames('{"id":"acme/x"}', 'acme/x', 'packages/server'), 'folder listing needs the path');
  assert.ok(!claimNames('{"id":"acme/x","path":"packages/other"}', 'acme/x', 'packages/server'));
  assert.ok(!claimNames('{"id":"acme/x","path":"packages/server"}', 'acme/x'), 'root listing is not claimed by a folder claim');
  assert.ok(!claimNames('{"id":["acme/x"]}', 'acme/x'), 'lists are not the claim shape');
  assert.ok(!claimNames('{"id":"acme/x","path":3}', 'acme/x'));
  assert.ok(!claimNames('{"id":"acme/y"}', 'acme/x'));
  assert.ok(!claimNames('not json', 'acme/x'));
  assert.ok(!claimNames('null', 'acme/x'));
  assert.ok(!claimNames('[{"id":"acme/x"}]', 'acme/x'));
  assert.ok(!claimNames('{"id":7}', 'acme/x'));
});

test('a folder listing is owner-verified only by a claim with its path', async () => {
  const routes = { [API + '.github/mcp-check/registry.json?ref=main']: { body: '{"id":"acme/x","path":"packages/server"}' } };
  assert.equal((await verify({ full: 'acme/x', branch: 'main', id: 'acme/x', path: 'packages/server', gh: ghWith(routes), now: NOW })).owner.verified, true);
  assert.equal((await verify({ full: 'acme/x', branch: 'main', id: 'acme/x', gh: ghWith(routes), now: NOW })).owner.verified, false);
});

test('ci and owner verified from the default branch', async () => {
  const calls = [];
  const gh = ghWith({
    [API + '.github/workflows?ref=main']: dir('a-build.yml', 'mcp-check.yml', 'README.md'),
    [API + '.github/workflows/a-build.yml?ref=main']: { body: 'jobs: {}\n' },
    [API + '.github/workflows/mcp-check.yml?ref=main']: { body: 'steps:\n  - uses: isokron-ai/mcp-check@v1\n' },
    [API + '.github/mcp-check/registry.json?ref=main']: { body: '{ "id": "acme/x" }' },
  }, calls);
  const r = await verify({ full: 'acme/x', branch: 'main', id: 'acme/x', gh, now: NOW });
  assert.deepEqual(r, {
    ci: { verified: true, checkedAt: '2026-11-20T12:00:00Z', workflow: '.github/workflows/mcp-check.yml' },
    owner: { verified: true, checkedAt: '2026-11-20T12:00:00Z', method: 'claim-file' },
  });
  assert.ok(calls.every((c) => c.method === 'GET'), 'reads only');
  assert.ok(calls.every((c) => c.url.startsWith('https://api.github.com/')), 'GitHub API only');
  assert.ok(calls.every((c) => c.headers.authorization === 'Bearer test-token'));
  assert.ok(!calls.some((c) => c.url.includes('README.md')), 'non-workflow files are skipped');
});

test('.yaml files count; nothing on the branch means not verified', async () => {
  const gh = ghWith({
    [API + '.github/workflows?ref=dev']: dir('ci.yaml'),
    [API + '.github/workflows/ci.yaml?ref=dev']: { body: '- uses: isokron-ai/mcp-check@v1' },
  });
  const r = await verify({ full: 'acme/x', branch: 'dev', id: 'acme/x', gh, now: NOW });
  assert.equal(r.ci.verified, true);
  assert.equal(r.owner.verified, false);
  const none = await verify({ full: 'acme/x', branch: 'main', id: 'acme/x', gh: ghWith({}), now: NOW });
  assert.deepEqual([none.ci.verified, none.ci.workflow, none.owner.verified, none.owner.method], [false, '', false, '']);
});

test('a claim for another id does not verify the owner', async () => {
  const gh = ghWith({ [API + '.github/mcp-check/registry.json?ref=main']: { body: '{"id":"acme/other"}' } });
  const r = await verify({ full: 'acme/x', branch: 'main', id: 'acme/x', gh, now: NOW });
  assert.equal(r.owner.verified, false);
});

test('GitHub errors other than 404 throw, so callers keep earlier marks', async () => {
  const gh = ghWith({ [API + '.github/workflows?ref=main']: { status: 502, body: { message: 'Bad gateway' } } });
  await assert.rejects(verify({ full: 'acme/x', branch: 'main', id: 'acme/x', gh, now: NOW }), /HTTP 502/);
});

test('an oversized claim file does not verify the owner', async () => {
  const gh = ghWith({ [API + '.github/mcp-check/registry.json?ref=main']: { body: '{"id":"acme/x","pad":"' + 'x'.repeat(70000) + '"}' } });
  const r = await verify({ full: 'acme/x', branch: 'main', id: 'acme/x', gh, now: NOW });
  assert.equal(r.owner.verified, false);
});

test('branch and path parts are URL-encoded', async () => {
  const calls = [];
  await verify({ full: 'acme/x', branch: 'feat/a b', id: 'acme/x', gh: ghWith({}, calls), now: NOW });
  assert.ok(calls.some((c) => c.url.endsWith('.github/workflows?ref=feat%2Fa%20b')));
});
