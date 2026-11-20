import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { workflowYaml } from '../scripts/lib/workflow-template.mjs';

const dir = new URL('../.github/workflows/', import.meta.url);
const workflows = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).map((f) => [f, readFileSync(new URL(f, dir), 'utf8')]);

test('every action is pinned by commit SHA', () => {
  for (const [f, y] of workflows) {
    for (const m of y.matchAll(/uses:\s*(\S+)/g)) assert.match(m[1], /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, f + ': ' + m[1]);
  }
});

test('checkouts keep no credentials', () => {
  for (const [f, y] of workflows) {
    const checkouts = (y.match(/uses: actions\/checkout@/g) || []).length;
    const off = (y.match(/persist-credentials: false/g) || []).length;
    assert.equal(off, checkouts, f);
  }
});

test('no event text is interpolated into the workflows', () => {
  for (const [f, y] of workflows) {
    assert.ok(!/\$\{\{\s*github\.event\.(issue|pull_request|comment)\.(body|title|user|head)/.test(y), f);
    assert.ok(!/\$\{\{\s*github\.head_ref/.test(y), f);
    assert.ok(!/pull_request_target|workflow_run/.test(y), f);
  }
});

test('default permissions are empty or read-only; writes are per job', () => {
  for (const [f, y] of workflows) assert.match(y, /^permissions:( \{\}|\n  contents: read)/m, f);
  const sub = workflows.find(([f]) => f === 'submission.yml')[1];
  assert.match(sub, /permissions:\n      contents: write\n      issues: write\n      pull-requests: write\n/);
  const ref = workflows.find(([f]) => f === 'refresh.yml')[1];
  assert.match(ref, /permissions:\n      contents: write\n      pull-requests: write\n/);
});

test('the README shows the same workflow the one-click link installs', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.ok(readme.includes('```yaml\n# .github/workflows/mcp-check.yml\n' + workflowYaml() + '```'));
});
