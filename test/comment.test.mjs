import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { renderResult, renderError } from '../scripts/comment.mjs';
import { scanBlock, topFindings } from '../scripts/scan.mjs';
import { workflowYaml } from '../scripts/lib/workflow-template.mjs';
import { COMMENT_MARKER } from '../scripts/lib/constants.mjs';
import { fixture } from './helpers.mjs';

const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';
function snapshot(name, text) {
  const url = new URL('./snapshots/' + name, import.meta.url);
  if (UPDATE || !existsSync(url)) { writeFileSync(url, text); return; }
  assert.equal(text, readFileSync(url, 'utf8'), 'snapshot ' + name + ' changed; rerun with UPDATE_SNAPSHOTS=1 if intended');
}

const report = fixture('report-kronicle-lite.json');
const SHA = '6df19640ea1c63aabdbb08aa6135915e5fc0cc63';
const repo = { id: 'isokron-ai/kronicle-lite', owner: 'isokron-ai', repo: 'kronicle-lite', defaultBranch: 'main', commit: SHA };
const scan = { ...scanBlock(report, { commit: SHA, at: '2026-11-20T12:00:00Z' }), checker: '1.0.0' };
const ci = { verified: false, checkedAt: '2026-11-20T12:00:00Z', workflow: '' };
const owner = { verified: false, checkedAt: '2026-11-20T12:00:00Z', method: '' };
const result = (over = {}) => renderResult({ repo, name: 'Kronicle Lite', scan, top: topFindings(report), ci, owner, pr: 12, ...over });

test('submission reply snapshot', () => {
  snapshot('comment-result.md', result());
});

test('error reply snapshots', () => {
  snapshot('comment-no-tools.md', renderError({ kind: 'no-tools', repo: { ...repo, id: 'isokron-ai/sea-lite', repo: 'sea-lite' }, scan: { commit: 'b536cc18d7eeb43a16da3d3bb1f88edfa6df3eb3', error: 'no tool definitions found in isokron-ai/sea-lite (scanned 54 of 54 source files).' } }));
  snapshot('comment-form.md', renderError({ kind: 'form', errors: ['The repository URL must look like https://github.com/owner/repo.', "The box is not ticked."] }));
});

test('the reply starts with the marker and has at most five findings', () => {
  const md = result();
  assert.ok(md.startsWith(COMMENT_MARKER + '\n'));
  const items = md.split('### Top findings')[1].split('###')[0].split('\n').filter((l) => /^\d+\. /.test(l));
  assert.ok(items.length >= 1 && items.length <= 5);
});

test('check links carry the registry UTM tags', () => {
  const md = result();
  const links = [...md.matchAll(/\((https:\/\/isokron\.ai\/[^)\s]+)\)/g)].map((m) => m[1]);
  assert.ok(links.some((l) => l.includes('/mcp-check/checks/openai-hints-explicit?')));
  for (const l of links) {
    const u = new URL(l);
    assert.equal(u.searchParams.get('utm_source'), 'github');
    assert.equal(u.searchParams.get('utm_medium'), 'registry');
    assert.equal(u.searchParams.get('utm_campaign'), 'registry');
  }
  assert.ok(md.includes('https://isokron.ai/mcp-check/registry/isokron-ai/kronicle-lite?utm_source=github&utm_medium=registry&utm_campaign=registry'));
});

test('the one-click link in the reply installs exactly the C1 workflow', () => {
  const md = result();
  const m = /\*\*\[Add mcp-check to your CI\]\((https:\/\/github\.com\/isokron-ai\/kronicle-lite\/new\/main\?[^)\s]+)\)\*\*/.exec(md);
  assert.ok(m, 'link present');
  assert.equal(new URL(m[1]).searchParams.get('value'), workflowYaml());
  assert.match(md, /Nothing is written to your repository until you review the file and commit it yourself/);
});

test('claim instructions carry the exact JSON', () => {
  const md = result();
  assert.ok(md.includes('```json\n{\n  "id": "isokron-ai/kronicle-lite"\n}\n```'));
  assert.ok(md.includes('`.github/mcp-check/registry.json`'));
});

test('verified marks replace the instructions', () => {
  const md = result({ ci: { ...ci, verified: true, workflow: '.github/workflows/mcp-check.yml' }, owner: { ...owner, verified: true, method: 'claim-file' } });
  assert.ok(!md.includes('Add mcp-check to your CI]('));
  assert.match(md, /already runs it in `\.github\/workflows\/mcp-check\.yml`/);
  assert.match(md, /listing shows \*\*Owner-verified\*\*/);
});

test('hostile names and tool names cannot inject Markdown, links or mentions', () => {
  const evil = structuredClone(report);
  evil.tools[0].name = 'x`](https://evil.example) @everyone <img src=x onerror=alert(1)>';
  evil.tools[0].findings.forEach((f) => { f.tool = evil.tools[0].name; });
  const md = renderResult({ repo, name: '[click](https://evil.example) @octocat <script>x</script> #1', scan, top: topFindings(evil), ci, owner, pr: 1 });
  const outside = md.replace(/```[\s\S]*?```/g, '').replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, '');
  assert.ok(md.includes('``x`](https://evil.example) @everyone'), 'tool name kept inside a code span');
  assert.ok(!outside.includes('](https://evil.example)'), 'no injected link');
  assert.ok(!/(^|[^\u200b])@(octocat|everyone)/.test(outside), 'no live mention outside code');
  assert.ok(!outside.includes('<script>') && !outside.includes('<img'), 'no raw HTML outside code spans');
});

test('subfolder listings name the folder and use the slug listing URL', () => {
  const md = result({ path: 'packages/server' });
  assert.match(md, /folder `packages\/server`/);
  assert.ok(md.includes('/mcp-check/registry/isokron-ai/kronicle-lite__packages-server?'));
  assert.ok(md.includes('"id": "isokron-ai/kronicle-lite/packages/server"'));
});

test('public copy rules: no email addresses, no prices', () => {
  const all = result() + renderError({ kind: 'no-tools', repo, scan: { commit: SHA, error: 'x' } }) + renderError({ kind: 'checker' });
  assert.ok(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(all), 'no email');
  assert.ok(!/[$\u20ac\u00a3]\s?\d/.test(all), 'no prices');
});
