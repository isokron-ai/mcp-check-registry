#!/usr/bin/env node
// submission.mjs: run by .github/workflows/submission.yml for a "Submit your MCP server" issue.
// Reads the issue from the event file ($GITHUB_EVENT_PATH), never from the shell. Then:
//   parse and validate the form -> scan the source (nothing is run) -> read the ci/owner marks ->
//   open or update a pull request adding servers/<owner>/<repo>.json -> reply on the issue -> label it.
// It writes to this repository only. It never comments, opens issues or pushes anywhere else.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { github as makeGithub, commitFiles } from './lib/github.mjs';
import { parseFormBody, validateSubmission } from './lib/form.mjs';
import { REGISTRY_REPO, COMMENT_MARKER, SUBMISSION_LABEL } from './lib/constants.mjs';
import { scanRepo as realScan, ScanError } from './scan.mjs';
import { verify as realVerify } from './verify.mjs';
import { buildEntry, entryFile, entryId, entryText } from './entry.mjs';
import { renderResult, renderError } from './comment.mjs';

export const LABELS = { ok: 'scanned', fix: 'needs-fix', noTools: 'no-tools', error: 'scan-error', review: 'needs-review' };
const BOT_LOGIN = 'github-actions[bot]';
const iso = (d) => new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Posts the reply, or updates the bot's earlier reply on the same issue. */
export async function upsertComment(gh, full, issue, body) {
  const comments = (await gh.listIssueComments(full, issue)) || [];
  const mine = comments.find((c) => c.user && c.user.login === BOT_LOGIN && typeof c.body === 'string' && c.body.startsWith(COMMENT_MARKER));
  if (mine) return gh.updateIssueComment(full, mine.id, body);
  return gh.createIssueComment(full, issue, body);
}

/** Sets one status label and removes the others (labels the event did not show may exist by now). */
async function setLabels(gh, full, issue, add) {
  for (const l of Object.values(LABELS).filter((x) => x !== add)) {
    try { await gh.removeLabel(full, issue, l); } catch { /* not on the issue */ }
  }
  await gh.addLabels(full, issue, [add]);
}

/**
 * Handles one issue event. deps are injectable for tests.
 * Returns { outcome, pr?, file? } where outcome is one of ok | fix | no-tools | error | conflict | skipped.
 */
export async function handle(event, { gh = makeGithub(), scan = realScan, verify = realVerify, registry = REGISTRY_REPO, now = () => new Date() } = {}) {
  const issue = event && event.issue;
  if (!issue || issue.pull_request || issue.state !== 'open') return { outcome: 'skipped' };
  const labels = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
  if (!labels.includes(SUBMISSION_LABEL)) return { outcome: 'skipped' };
  const n = issue.number;
  const reply = (body) => upsertComment(gh, registry, n, body);

  const { fields, errors: parseErrors } = parseFormBody(issue.body);
  const { submission, errors } = parseErrors.length ? { submission: null, errors: parseErrors } : validateSubmission(fields);
  if (!submission) {
    await reply(renderError({ kind: 'form', errors }));
    await setLabels(gh, registry, n, LABELS.fix);
    return { outcome: 'fix' };
  }

  let res;
  try {
    res = await scan({ owner: submission.owner, repo: submission.repo, path: submission.path });
  } catch (e) {
    const kind = e instanceof ScanError && (e.code === 'not-found' || e.code === 'private') ? e.code : 'checker';
    await reply(renderError({ kind, message: e instanceof ScanError ? e.message : 'The repository could not be read right now.' }));
    await setLabels(gh, registry, n, kind === 'checker' ? LABELS.error : LABELS.fix);
    return { outcome: kind === 'checker' ? 'error' : 'fix' };
  }
  if (res.scan.status !== 'ok') {
    await reply(renderError({ kind: 'no-tools', repo: res.repo, scan: res.scan }));
    await setLabels(gh, registry, n, LABELS.noTools);
    return { outcome: 'no-tools' };
  }

  const full = res.repo.id;
  const id = entryId(full, submission.path);
  const file = entryFile(full, submission.path);
  const marks = await verify({ full, branch: res.repo.defaultBranch, id, gh });

  let existing = null;
  const prevText = await gh.getFile(registry, file, 'main');
  if (prevText != null) {
    try { existing = JSON.parse(prevText); } catch { existing = null; }
    if (!existing || String(existing.id).toLowerCase() !== id.toLowerCase()) {
      await reply(renderError({ kind: 'conflict', message: 'Another listing already uses the file ' + file + '.' }));
      await setLabels(gh, registry, n, LABELS.review);
      return { outcome: 'conflict' };
    }
  }

  const entry = buildEntry({
    fullName: full,
    path: submission.path,
    name: submission.name,
    description: submission.description,
    submitted: { at: iso(issue.created_at || now()), by: issue.user.login, issue: n },
    scan: res.scan,
    ci: marks.ci,
    owner: marks.owner,
    existing,
  });
  // An edited issue may have changed the repository; the branch keeps only this issue's current entry.
  const branch = 'submission/issue-' + n;
  const files = { [file]: entryText(entry) };
  const ref = await gh.getRef(registry, branch);
  if (ref) {
    const cmp = await gh.compare(registry, 'main', ref.object.sha);
    for (const f of (cmp && cmp.files) || []) if (/^servers\/.+\.json$/.test(f.filename) && f.filename !== file && f.status === 'added') files[f.filename] = null;
  }
  const verb = existing ? 'Update' : 'Add';
  await commitFiles(gh, registry, { base: 'main', branch, files, message: verb + ' ' + id + ' (submission #' + n + ')' });

  const [owner] = registry.split('/');
  const open = (await gh.listPulls(registry, { state: 'open', head: owner + ':' + branch })) || [];
  const isOwner = issue.user.login.toLowerCase() === res.repo.owner.toLowerCase();
  const body = [
    verb + 's ' + '`' + file + '`' + ' from #' + n + '.',
    '',
    '- Scan: ' + res.scan.tools + ' tools at `' + res.scan.commit.slice(0, 7) + '`, grades ' + Object.entries(res.scan.grades).map(([k, v]) => k + ' ' + (v || 'n/a')).join(', ') + '.',
    '- CI-verified: ' + (marks.ci.verified ? 'yes (`' + marks.ci.workflow + '`)' : 'no') + '. Owner-verified: ' + (marks.owner.verified ? 'yes' : 'no') + '.',
    '- Submitter ' + (isOwner ? 'is the repository owner.' : 'is not the repository owner; the form box is ticked. Check before merging.'),
    '',
    'Before merging: `npm test` passes locally, the name and description are fit to publish.',
  ].join('\n');
  let pr;
  if (open.length) { pr = open[0].number; await gh.updatePull(registry, pr, { title: verb + ' ' + id, body }); } else {
    const created = await gh.createPull(registry, { title: verb + ' ' + id, head: branch, base: 'main', body, maintainer_can_modify: true });
    pr = created.number;
  }
  await reply(renderResult({ repo: res.repo, path: submission.path, name: entry.name, scan: res.scan, top: res.top, ci: marks.ci, owner: marks.owner, pr, existing: !!existing }));
  await setLabels(gh, registry, n, LABELS.ok);
  return { outcome: 'ok', pr, file };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const path = process.env.GITHUB_EVENT_PATH;
  if (!path) { process.stderr.write('GITHUB_EVENT_PATH is not set\n'); process.exitCode = 2; } else {
    const event = JSON.parse(readFileSync(path, 'utf8'));
    handle(event).then((r) => { process.stdout.write('submission: ' + JSON.stringify(r) + '\n'); }, async (e) => {
      process.stderr.write('submission: ' + e.message + '\n');
      try { await upsertComment(makeGithub(), REGISTRY_REPO, event.issue.number, renderError({ kind: 'checker', message: 'The check stopped with an internal error. We will look at it here.' })); } catch { /* best effort */ }
      process.exitCode = 1;
    });
  }
}
