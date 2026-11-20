import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowYaml, yamlQuote, claimJson, addToCiUrl, claimUrl, newFileUrl } from '../scripts/lib/workflow-template.mjs';
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

test('a folder listing adds working-directory under the mcp-check step; root listings stay plain C1', () => {
  assert.equal(workflowYaml(PINS, { path: '' }), workflowYaml());
  const y = workflowYaml(PINS, { path: 'packages/server' });
  assert.equal(y, workflowYaml().replace(/\n$/, '') + '\n        with:\n          working-directory: "packages/server"\n');
});

test('folder paths round-trip through the link and stay one quoted YAML string', () => {
  for (const path of ['packages/server', 'my folder/@scope/srv', 'a "b" #c: d\\e', 'x\ny']) {
    const url = addToCiUrl({ owner: 'acme', repo: 'mono', branch: 'main', path });
    const value = new URL(url).searchParams.get('value');
    assert.equal(value, workflowYaml(PINS, { path }));
    const lines = value.split('\n');
    assert.equal(lines.length, workflowYaml().split('\n').length + 2, 'exactly two extra lines: ' + JSON.stringify(path));
    const m = /^          working-directory: (".*")$/.exec(lines[lines.length - 2]);
    assert.ok(m, 'quoted scalar on one line');
    assert.equal(JSON.parse(m[1]), path, 'the double-quoted scalar decodes back to the path');
    assert.equal(m[1], yamlQuote(path));
  }
});
