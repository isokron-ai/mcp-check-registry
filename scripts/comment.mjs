#!/usr/bin/env node
// comment.mjs: renders the reply the submission workflow posts on the submission issue in this
// repository. As a command: comment.mjs <scan-result.json> [--name "..."] [--pr N] prints a preview
// from the output of scan.mjs --out.
//
// Every value that came from outside (repository and branch names, tool names, the submitted
// name) is escaped or put in a code span. Check titles come from the checker's own rubric.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { COMMENT_MARKER, CHECKS_BASE, SITE_HOME, UTM, SECTIONS, SECTION_LABELS, WORKFLOW_PATH, CLAIM_PATH } from './lib/constants.mjs';
import { mdText, mdCode, tagged } from './lib/text.mjs';
import { workflowYaml, claimJson, addToCiUrl, claimUrl } from './lib/workflow-template.mjs';
import { entryId, listingUrl } from './entry.mjs';

const SEV_WORD = { blocking: 'blocking', attention: 'attention', advice: 'advice' };
const FIDELITY_WORD = {
  exact: 'from a tool list committed to the repository',
  literal: 'from tool definitions written as literals in the source',
  derived: 'reproduced from the SDK registrations in the source (schemas follow the SDK and may differ in detail)',
  names: 'from a manifest that lists names and descriptions only',
};

const checkLink = (id) => tagged(CHECKS_BASE + '/' + encodeURIComponent(id), UTM);
const short = (sha) => String(sha).slice(0, 7);
const commitLink = (full, sha) => '[' + mdCode(short(sha)) + '](https://github.com/' + full + '/tree/' + sha + ')';

function toolList(tools, max = 3) {
  if (!tools.length) return 'the server as a whole';
  const shown = tools.slice(0, max).map((t) => mdCode(t, 64)).join(', ');
  const n = tools.length;
  return n + (n === 1 ? ' tool: ' : ' tools: ') + shown + (n > max ? ' and ' + (n - max) + ' more' : '');
}

function gradesTable(scan) {
  const rows = ['| Section | Grade |', '|---|---|'];
  for (const s of SECTIONS) {
    const g = scan.grades[s];
    rows.push('| ' + SECTION_LABELS[s] + ' | ' + (g ? '**' + g + '**' : s === 'surface' ? 'not graded: no write tools' : 'not graded') + ' |');
  }
  return rows.join('\n');
}

function ciAndClaim({ full, owner, repo, branch, id, ci, ownerMark }) {
  const yaml = workflowYaml();
  const out = [];
  out.push('### Add mcp-check to your CI');
  out.push('');
  if (ci?.verified) {
    out.push('Your default branch already runs it in ' + mdCode(ci.workflow) + ', so the listing shows **CI-verified**.');
  } else {
    out.push('**[Add mcp-check to your CI](' + addToCiUrl({ owner, repo, branch }) + ')**');
    out.push('');
    out.push('The link opens GitHub\'s new-file page in ' + mdCode(full) + ' with ' + mdCode(WORKFLOW_PATH) + ' filled in. Nothing is written to your repository until you review the file and commit it yourself. Without write access, GitHub offers to open a pull request instead.');
    out.push('');
    out.push('The workflow checks out your code without keeping credentials, reads the tool definitions from it and grades them on every push and pull request. It runs nothing from your repository and needs read access only. Once it is on ' + mdCode(branch) + ', the listing shows **CI-verified** after the next nightly check.');
  }
  out.push('');
  out.push('<details><summary>The workflow file</summary>');
  out.push('');
  out.push('```yaml');
  out.push(yaml.trimEnd());
  out.push('```');
  out.push('');
  out.push('</details>');
  out.push('');
  out.push('### Claim the listing');
  out.push('');
  if (ownerMark?.verified) {
    out.push('Your default branch has the claim file, so the listing shows **Owner-verified**.');
  } else {
    out.push('Commit this file as ' + mdCode(CLAIM_PATH) + ' on ' + mdCode(branch) + ' ([open it pre-filled](' + claimUrl({ owner, repo, branch, id }) + ')):');
    out.push('');
    out.push('```json');
    out.push(claimJson(id).trimEnd());
    out.push('```');
    out.push('');
    out.push('The listing shows **Owner-verified** after the next nightly check. There is no sign-in and no app to install: the file on your default branch is the claim. Delete it to drop the mark.');
  }
  return out;
}

/** The reply for a graded repository. */
export function renderResult({ repo, path = '', name, scan, top, ci = null, owner: ownerMark = null, pr = null, existing = false }) {
  const full = repo.id;
  const id = entryId(full, path);
  const listing = tagged(listingUrl(full, path), UTM);
  const out = [COMMENT_MARKER];
  out.push('## mcp-check results for ' + mdCode(id));
  out.push('');
  out.push('**' + mdText(name, 80) + '**: ' + scan.tools + (scan.tools === 1 ? ' tool' : ' tools') + ' read from ' + commitLink(full, scan.commit) + ' on ' + mdCode(repo.defaultBranch) + (path ? ', folder ' + mdCode(path) : '') + ', ' + (FIDELITY_WORD[scan.fidelity] || 'from the source') + '.');
  out.push('');
  out.push('Nothing was installed, built or run. The checker (`@isokron/mcp-check` ' + mdText(scan.checker, 20) + ', rubric ' + mdText(scan.rubric, 20) + ') reads the tool definitions in the source and grades them as text; it never starts or calls your server.');
  out.push('');
  out.push(gradesTable(scan));
  out.push('');
  out.push('Findings: ' + scan.findings.high + ' high, ' + scan.findings.medium + ' medium, ' + scan.findings.low + ' low.');
  out.push('');
  if (top.length) {
    out.push('### Top findings');
    out.push('');
    top.forEach((f, i) => {
      out.push((i + 1) + '. **[' + f.id + '](' + checkLink(f.id) + ')** (' + SEV_WORD[f.severity] + '): ' + mdText(f.title, 160) + '. ' + toolList(f.tools).replace(/^./, (c) => c.toUpperCase()) + '.');
    });
    out.push('');
    out.push('Each link explains the check and how to fix it. The full report is on the [checker page](' + tagged(SITE_HOME, UTM) + ') or from `npx @isokron/mcp-check --repo github.com/' + full + '`.');
    out.push('');
  }
  out.push(...ciAndClaim({ full, owner: repo.owner, repo: repo.repo, branch: repo.defaultBranch, id, ci, ownerMark }));
  out.push('');
  out.push('### Your listing');
  out.push('');
  const when = pr ? ' once #' + pr + ' is merged and the site rebuilds.' : ' once this is merged and the site rebuilds.';
  out.push((existing ? 'Your listing at ' + listing + ' updates' : 'Your listing will be at ' + listing) + when);
  out.push('Grades refresh nightly from your default branch. Edit this issue to scan again now. To remove the listing, open a removal request in this repository; it is honored for maintainers.');
  return out.join('\n') + '\n';
}

/** "(scanned 54 of 54 source files)" from the checker's message, when it has one. */
const scannedNote = (err) => { const m = /\((scanned \d+ of \d+ source files)\)/.exec(String(err || '')); return m ? ' (' + m[1] + ')' : ''; };

const HOW = () => 'How grading works: ' + tagged(SITE_HOME, UTM);

/** The reply when the submission could not be graded. kind: form | not-found | private | no-tools | checker | conflict */
export function renderError({ kind, errors = [], repo = null, scan = null, message = '' }) {
  const out = [COMMENT_MARKER];
  if (kind === 'form') {
    out.push('## The submission needs a fix');
    out.push('');
    out.push('Thanks for submitting. The form could not be read:');
    out.push('');
    for (const e of errors.slice(0, 10)) out.push('- ' + mdText(e, 300));
    out.push('');
    out.push('Edit the issue to fix it; the check runs again on every edit.');
  } else if (kind === 'not-found' || kind === 'private') {
    out.push('## The repository could not be read');
    out.push('');
    out.push(mdText(message, 300));
    out.push('');
    out.push('The registry lists public GitHub repositories. Edit the issue with the right URL and the check runs again.');
  } else if (kind === 'no-tools') {
    const full = repo.id;
    out.push('## No tool definitions found in ' + mdCode(full));
    out.push('');
    out.push('The checker reads tool definitions straight from the source and runs nothing. It read ' + commitLink(full, scan.commit) + ' on ' + mdCode(repo.defaultBranch) + ' and found none' + scannedNote(scan.error) + '. That usually means the tools are built at run time in a way a static reader can\'t follow: generated from an API description, loaded from configuration, or registered through a wrapper.');
    out.push('');
    out.push('You can still be listed:');
    out.push('');
    out.push('1. On your machine, save your server\'s tool list: `npx @isokron/mcp-check capture -- <command that starts your server> > tools.json`. This starts your server locally and asks it for its tools/list only; no tool is called.');
    out.push('2. Commit `tools.json` to the repository (in the root, or in the folder you listed). The static reader uses a committed tool list as is.');
    out.push('3. Edit this issue (any change) and the check runs again.');
    out.push('');
    out.push('In your own CI, the Action can also grade the live list: set `tools-file: tools.json`, or `command:` with the command that starts your server.');
  } else if (kind === 'conflict') {
    out.push('## This listing needs a look from us');
    out.push('');
    out.push(mdText(message, 300));
    out.push('');
    out.push('We will follow up in this issue.');
  } else {
    out.push('## The check could not finish');
    out.push('');
    out.push(mdText(message || 'Something went wrong while reading the repository.', 300));
    out.push('');
    out.push('This is usually temporary. Edit the issue to try again; if it keeps failing we will look at it here.');
  }
  out.push('');
  out.push(HOW());
  return out.join('\n') + '\n';
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  if (!args[0]) { process.stderr.write('usage: comment.mjs <scan-result.json> [--name "..."] [--path p] [--pr N]\n'); process.exitCode = 2; } else {
    const r = JSON.parse(readFileSync(args[0], 'utf8'));
    const path = opt('--path') || '';
    const md = r.scan.status === 'ok'
      ? renderResult({ repo: r.repo, path, name: opt('--name') || r.repo.repo, scan: r.scan, top: r.top, ci: r.ci || null, owner: r.owner || null, pr: opt('--pr') ? Number(opt('--pr')) : null })
      : renderError({ kind: 'no-tools', repo: r.repo, scan: r.scan });
    process.stdout.write(md);
  }
}
