import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEntry, entryFile, entryId, listingUrl, pathSlug, materiallyChanged, checkAll, listEntryFiles } from '../scripts/entry.mjs';
import { loadSchema, validate } from '../scripts/lib/schema.mjs';
import { scanBlock } from '../scripts/scan.mjs';
import { fixture } from './helpers.mjs';

const AT = '2026-11-20T12:00:00Z';
const SHA = 'a'.repeat(40);
const base = () => ({
  fullName: 'Acme/Weather-MCP',
  name: 'Weather MCP',
  description: 'Forecasts and alerts for agents.',
  submitted: { at: AT, by: 'octo-dev', issue: 7 },
  scan: scanBlock(fixture('report-kronicle-lite.json'), { commit: SHA, at: AT }),
  ci: { verified: false, checkedAt: AT, workflow: '' },
  owner: { verified: false, checkedAt: AT, method: '' },
});

test('a built entry matches contract C2 and the schema', () => {
  const e = buildEntry(base());
  assert.deepEqual(Object.keys(e), ['schema', 'id', 'repo', 'path', 'name', 'description', 'submitted', 'scan', 'ci', 'owner']);
  assert.equal(e.id, 'Acme/Weather-MCP');
  assert.equal(e.repo, 'https://github.com/Acme/Weather-MCP');
  assert.equal(e.scan.source, 'repo-static');
  assert.match(e.scan.catalogHash, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(e.scan.grades), ['spec', 'anthropic', 'openai', 'security', 'quality', 'surface']);
  assert.deepEqual(validate(e, loadSchema()), []);
});

test('file names and listing URLs are lowercase; subfolders get a slug suffix', () => {
  assert.equal(entryFile('Acme/Weather-MCP'), 'servers/acme/weather-mcp.json');
  assert.equal(entryFile('Acme/mono', 'packages/Server-X'), 'servers/acme/mono__packages-server-x.json');
  assert.equal(entryId('Acme/mono', 'packages/Server-X'), 'Acme/mono/packages/Server-X');
  assert.equal(listingUrl('Acme/Weather-MCP'), 'https://isokron.ai/mcp-check/registry/acme/weather-mcp');
  assert.equal(listingUrl('Acme/mono', 'packages/@scope/x'), 'https://isokron.ai/mcp-check/registry/acme/mono__packages-scope-x');
  assert.equal(pathSlug('../a//b'), 'a-b');
});

test('a subfolder entry validates', () => {
  const e = buildEntry({ ...base(), path: 'packages/server' });
  assert.equal(e.id, 'Acme/Weather-MCP/packages/server');
});

test('an update keeps the original submission record', () => {
  const first = buildEntry(base());
  const again = buildEntry({ ...base(), name: 'New name', submitted: { at: '2026-12-01T00:00:00Z', by: 'someone-else', issue: 9 }, existing: first });
  assert.deepEqual(again.submitted, first.submitted);
  assert.equal(again.name, 'New name');
});

test('the schema rejects what the contract does not allow', () => {
  const s = loadSchema();
  const bad = [
    (e) => { e.scan.grades.spec = 'E'; },
    (e) => { e.scan.grades.spec = null; },
    (e) => { e.extra = 1; },
    (e) => { e.id = 'acme'; },
    (e) => { e.repo = 'https://gitlab.com/acme/x'; },
    (e) => { e.scan.commit = 'main'; },
    (e) => { e.scan.source = 'live'; },
    (e) => { e.ci.workflow = '../../etc/passwd'; },
    (e) => { e.owner.method = 'oauth'; },
    (e) => { e.submitted.by = 'not a login'; },
    (e) => { e.name = ''; },
    (e) => { e.scan.findings.high = -1; },
    (e) => { e.submitted.at = 'yesterday'; },
  ];
  for (const mutate of bad) {
    const e = buildEntry(base());
    mutate(e);
    assert.ok(validate(e, s).length > 0, mutate.toString());
  }
  assert.throws(() => buildEntry({ ...base(), name: 'x'.repeat(81) }), /does not match the schema/);
});

test('surface may be null; the other grades may not', () => {
  const e = buildEntry(base());
  e.scan.grades.surface = null;
  assert.deepEqual(validate(e, loadSchema()), []);
});

test('a no-tools scan validates with null grades', () => {
  const e = buildEntry(base());
  Object.assign(e.scan, { status: 'no-tools', error: 'no tool definitions found', rubric: null, fidelity: null, tools: null, catalogHash: null, grades: null, findings: null });
  assert.deepEqual(validate(e, loadSchema()), []);
});

test('only material changes count', () => {
  const a = buildEntry(base());
  const b = structuredClone(a);
  b.scan.at = '2026-11-21T00:00:00Z'; b.scan.commit = 'b'.repeat(40); b.ci.checkedAt = b.scan.at; b.owner.checkedAt = b.scan.at;
  assert.equal(materiallyChanged(a, b), false);
  b.ci.verified = true; b.ci.workflow = '.github/workflows/mcp-check.yml';
  assert.equal(materiallyChanged(a, b), true);
  const c = structuredClone(a); c.scan.grades.openai = 'A';
  assert.equal(materiallyChanged(a, c), true);
});

test('every committed entry in servers/ is valid', () => {
  assert.ok(listEntryFiles().length >= 3);
  assert.deepEqual(checkAll(), []);
});

test('the validator refuses schema keywords it does not implement', () => {
  assert.match(validate(1, { type: 'integer', oneOf: [] }).join(), /oneOf is not supported/);
});
