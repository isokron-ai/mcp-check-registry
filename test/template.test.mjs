import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowYaml, claimJson, addToCiUrl, claimUrl, newFileUrl } from '../scripts/lib/workflow-template.mjs';
import { PINS } from '../scripts/lib/constants.mjs';

test('the workflow is contract C1 with the current pins', () => {
  assert.equal(workflowYaml(), [
    'name: MCP check',
    'on:',
    '  push:',
    '  pull_request:',
    'permissions:',
    '  contents: read',
    'jobs:',
    '  mcp-check:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@' + PINS.checkout.ref + ' # ' + PINS.checkout.label,
    '        with:',
    '          persist-credentials: false',
    '      - uses: isokron-ai/mcp-check@v1',
    '',
  ].join('\n'));
  assert.match(PINS.checkout.ref, /^[0-9a-f]{40}$/);
});

test('a SHA pin renders with its version comment', () => {
  const y = workflowYaml({ ...PINS, mcpCheck: { ref: 'a'.repeat(40), label: 'v1.1.0' } });
  assert.match(y, /uses: isokron-ai\/mcp-check@a{40} # v1\.1\.0\n/);
});

test('the one-click link round-trips the YAML exactly', () => {
  const url = addToCiUrl({ owner: 'acme', repo: 'weather-mcp', branch: 'main' });
  assert.ok(url.startsWith('https://github.com/acme/weather-mcp/new/main?filename=.github/workflows/mcp-check.yml&value='));
  const u = new URL(url);
  assert.equal(u.searchParams.get('filename'), '.github/workflows/mcp-check.yml');
  assert.equal(u.searchParams.get('value'), workflowYaml());
  assert.ok(!/[\s#]/.test(url), 'no raw spaces, newlines or # in the link');
});

test('branch names with slashes and odd characters are encoded per segment', () => {
  const url = newFileUrl({ owner: 'acme', repo: 'x', branch: 'release/v2 #1', filename: 'a/b.txt', value: 'a+b &c=d\n' });
  assert.ok(url.includes('/new/release/v2%20%231?'));
  const u = new URL(url);
  assert.equal(u.searchParams.get('value'), 'a+b &c=d\n');
});

test('the claim file names the id and round-trips through its link', () => {
  assert.deepEqual(JSON.parse(claimJson('acme/x')), { id: 'acme/x' });
  assert.deepEqual(JSON.parse(claimJson('acme/x', 'packages/server')), { id: 'acme/x', path: 'packages/server' });
  const u = new URL(claimUrl({ owner: 'acme', repo: 'x', branch: 'main', id: 'acme/x', path: 'packages/server' }));
  assert.equal(u.searchParams.get('filename'), '.github/mcp-check/registry.json');
  assert.deepEqual(JSON.parse(u.searchParams.get('value')), { id: 'acme/x', path: 'packages/server' });
});
