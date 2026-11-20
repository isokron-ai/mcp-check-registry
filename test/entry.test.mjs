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
  defaultBranch: 'main',
  name: 'Weather MCP',
  description: 'Forecasts and alerts for agents.',
  submitted: { at: AT, by: 'octo-dev', issue: 7 },
  scan: scanBlock(fixture('report-kronicle-lite.json'), { commit: SHA, at: AT }),
  ci: { verified: false, checkedAt: AT, workflow: '' },
  owner: { verified: false, checkedAt: AT, method: '' },
});

test('a built entry matches contract C2 and the schema', () => {
  const e = buildEntry(base());
  assert.deepEqual(Object.keys(e), ['schema', 'id', 'repo', 'path', 'defaultBranch', 'name', 'description', 'submitted', 'scan', 'ci', 'owner']);
  assert.equal(e.id, 'acme/weather-mcp');
  assert.equal(e.repo, 'https://github.com/acme/weather-mcp');
  assert.equal(e.defaultBranch, 'main');
  assert.equal(e.scan.source, 'repo-static');
  assert.match(e.scan.catalogHash, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(e.scan.grades), ['spec', 'anthropic', 'openai', 'security', 'quality', 'surface']);
  assert.deepEqual(validate(e, loadSchema()), []);
});

test('ids, file names and listing URLs are lower-case; folders get a slug suffix', () => {
  assert.equal(entryId('Acme/Weather-MCP'), 'acme/weather-mcp');
  assert.equal(entryFile('Acme/Weather-MCP'), 'servers/acme/weather-mcp.json');
  assert.equal(entryFile('Acme/mono', 'packages/Server_X'), 'servers/acme/mono~packages-server-x.json');
  assert.equal(listingUrl('Acme/Weather-MCP'), 'https://isokron.ai/mcp-check/registry/acme/weather-mcp');
  assert.equal(listingUrl('Acme/mono', 'packages/@scope/x.y'), 'https://isokron.ai/mcp-check/registry/acme/mono~packages--scope-x-y');
  assert.equal(pathSlug('Packages/Server_X.v2'), 'packages-server-x-v2');
});

test('a folder entry keeps id owner/repo and the folder in path', () => {
  const e = buildEntry({ ...base(), path: 'packages/Server' });
  assert.equal(e.id, 'acme/weather-mcp');
  assert.equal(e.path, 'packages/Server');
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
    (e) => { e.id = 'Acme/x'; },
    (e) => { e.id = 'acme/x/packages/server'; },
    (e) => { delete e.defaultBranch; },
    (e) => { e.defaultBranch = ''; },
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

test('name, description and scan.error refuse control characters only', () => {
  const s = loadSchema();
  const e = buildEntry({ ...base(), name: 'Weather @ MCP <beta> "x" #1 \u00e9\u6f22', description: 'Any text: [links](x), `code`, emoji \u2603.' });
  assert.deepEqual(validate(e, s), []);
  for (const [k, v] of [['name', 'a\u0007b'], ['description', 'line\nbreak'], ['description', 'del\u007f'], ['name', 'c1\u0085']]) {
    const bad = structuredClone(e); bad[k] = v;
    assert.ok(validate(bad, s).some((x) => x.includes('does not match')), k + ' ' + JSON.stringify(v));
  }
  const nt = structuredClone(e);
  Object.assign(nt.scan, { status: 'no-tools', error: 'x\ny', rubric: null, fidelity: null, tools: null, catalogHash: null, grades: null, findings: null });
  assert.ok(validate(nt, s).length > 0, 'schema refuses a newline in scan.error');
});

test('building an entry normalises scan.error to one line of at most 500 characters', () => {
  const scan = { ...base().scan, status: 'no-tools', error: 'no tool definitions\n\tfound\u0000 here ' + 'x'.repeat(600), rubric: null, fidelity: null, tools: null, catalogHash: null, grades: null, findings: null };
  const e = buildEntry({ ...base(), scan });
  assert.ok(e.scan.error.startsWith('no tool definitions found here x'));
  assert.equal(e.scan.error.length, 500);
  assert.ok(!/[\u0000-\u001f\u007f-\u009f]/.test(e.scan.error));
});

test('folder files and pages use "~", which no repository name contains', () => {
  assert.equal(entryFile('acme/my__repo'), 'servers/acme/my__repo.json');
  assert.equal(entryFile('acme/my', 'repo'), 'servers/acme/my~repo.json');
  assert.notEqual(entryFile('acme/my__repo'), entryFile('acme/my', 'repo'));
});
