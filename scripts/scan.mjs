#!/usr/bin/env node
// scan.mjs <owner/repo> [--path p] [--out file.json]
// Reads a public repository's MCP tool definitions from its source with @isokron/mcp-check and
// prints the registry's scan block (contract C2). Nothing in the repository is installed, built or run.
// GITHUB_TOKEN, when set, is passed to the checker for GitHub's API rate limits; it is never printed.
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { github } from './lib/github.mjs';
import { SEVERITY_MAP, SECTIONS } from './lib/constants.mjs';
import { parsePath } from './lib/form.mjs';
import { oneLine } from './lib/text.mjs';

const require = createRequire(import.meta.url);
const PKG = require('@isokron/mcp-check/package.json');
export const CHECKER_VERSION = PKG.version;
const BIN = join(dirname(require.resolve('@isokron/mcp-check/package.json')), PKG.bin['mcp-check']);

export class ScanError extends Error {
  /** code: 'not-found' | 'private' | 'no-tools' | 'checker' */
  constructor(message, code) { super(message); this.code = code; }
}

/** Looks the repository up: canonical name, default branch and its head commit. */
export async function resolveRepo(gh, owner, repo) {
  const r = await gh.getRepo(owner + '/' + repo);
  if (!r) throw new ScanError('The repository ' + owner + '/' + repo + ' was not found, or it is not public.', 'not-found');
  if (r.private || (r.visibility && r.visibility !== 'public')) throw new ScanError('The repository ' + r.full_name + ' is not public. The registry lists public repositories only.', 'private');
  const commit = await gh.getBranchHead(r.full_name, r.default_branch);
  if (!commit || !/^[0-9a-f]{40}$/.test(commit)) throw new ScanError('Could not read the head commit of ' + r.full_name + '.', 'checker');
  const [o, n] = r.full_name.split('/');
  return { id: r.full_name, owner: o, repo: n, defaultBranch: r.default_branch, commit, archived: !!r.archived, fork: !!r.fork };
}

/** Runs the pinned checker on github.com/<owner>/<repo>/tree/<commit>[/<path>]. No shell. */
export function runChecker(ref, { token = process.env.GITHUB_TOKEN, timeout = 180 } = {}) {
  const args = [BIN, '--repo', ref, '--format', 'json', '--timeout', String(timeout)];
  const env = { PATH: process.env.PATH || '', HOME: process.env.HOME || '', NO_COLOR: '1' };
  if (token) { env.GITHUB_TOKEN = token; args.push('--github-token-env', 'GITHUB_TOKEN'); }
  return new Promise((resolve) => {
    execFile(process.execPath, args, { env, maxBuffer: 64 * 1024 * 1024, timeout: (timeout + 30) * 1000 }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 99) : 0, stdout, stderr: String(stderr || '') });
    });
  });
}

const sevRank = { blocking: 0, attention: 1, advice: 2 };
const allFindings = (r) => (r.tools || []).flatMap((t) => t.findings || []).concat(r.server || []);

/** The C2 scan block from a checker report. */
export function scanBlock(report, { commit, at }) {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const f of allFindings(report)) { const k = SEVERITY_MAP[f.severity]; if (k) counts[k] += 1; }
  const grades = {};
  for (const s of SECTIONS) grades[s] = report.sections?.[s]?.grade ?? null;
  const hash = report.input?.catalogHash;
  return {
    at,
    commit,
    checker: CHECKER_VERSION,
    rubric: report.rubric_version || null,
    source: 'repo-static',
    status: 'ok',
    fidelity: report.source?.fidelity ?? null,
    tools: report.input?.tools ?? (report.tools || []).length,
    catalogHash: /^[0-9a-f]{64}$/.test(hash || '') ? 'sha256:' + hash : null,
    grades,
    findings: counts,
  };
}

/** A scan block for a repository where the static reader found no tool definitions. */
export function noToolsBlock({ commit, at, error }) {
  return { at, commit, checker: CHECKER_VERSION, rubric: null, source: 'repo-static', status: 'no-tools', error: oneLine(error, 500), fidelity: null, tools: null, catalogHash: null, grades: null, findings: null };
}

/**
 * The most important findings, grouped by check: blocking first, then attention; advice only
 * when there is nothing else. Each has the check id, its title, the severity and the tool names.
 */
export function topFindings(report, max = 5) {
  const by = new Map();
  for (const f of allFindings(report)) {
    if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(f.id || '') || !(f.severity in sevRank)) continue;
    const g = by.get(f.id) || { id: f.id, title: f.title || f.id, severity: f.severity, tools: [] };
    if (sevRank[f.severity] < sevRank[g.severity]) g.severity = f.severity;
    if (f.tool && !g.tools.includes(f.tool)) g.tools.push(f.tool);
    by.set(f.id, g);
  }
  let list = [...by.values()];
  const serious = list.filter((g) => g.severity !== 'advice');
  if (serious.length) list = serious;
  list.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || b.tools.length - a.tools.length || a.id.localeCompare(b.id));
  return list.slice(0, max);
}

/**
 * Full scan of one repository (optionally a subfolder). Returns { repo, scan, top, report }.
 * Throws ScanError for a missing or private repository and for checker failures;
 * a repository with no tool definitions returns status 'no-tools' instead.
 */
export async function scanRepo({ owner, repo, path = '', gh = github(), run = runChecker, now = () => new Date() }) {
  const info = await resolveRepo(gh, owner, repo);
  const ref = 'https://github.com/' + info.owner + '/' + info.repo + '/tree/' + info.commit + (path ? '/' + path : '');
  const at = now().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const r = await run(ref);
  if (r.code === 0) {
    let report;
    try { report = JSON.parse(r.stdout); } catch { throw new ScanError('The checker did not return a JSON report.', 'checker'); }
    return { repo: info, scan: scanBlock(report, { commit: info.commit, at }), top: topFindings(report), report };
  }
  const msg = r.stderr.split('\n').map((l) => l.replace(/^mcp-check:\s*/, '').trim()).filter(Boolean).pop() || 'exit ' + r.code;
  if (/no tool definitions found/i.test(r.stderr)) {
    return { repo: info, scan: noToolsBlock({ commit: info.commit, at, error: msg.replace(/ Run the server and use --command or --url\.?$/, '') }), top: [], report: null };
  }
  throw new ScanError('The checker could not read the repository: ' + msg.slice(0, 300), 'checker');
}

async function main(argv) {
  const args = argv.slice(2);
  let target = null; let path = ''; let out = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--path') path = args[++i] ?? '';
    else if (args[i] === '--out') out = args[++i];
    else if (!target) target = args[i];
    else throw new Error('unexpected argument ' + args[i]);
  }
  const m = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(target || '');
  if (!m) { process.stderr.write('usage: scan.mjs <owner/repo> [--path p] [--out file.json]\n'); return 2; }
  const p = parsePath(path);
  if (p.error) { process.stderr.write(p.error + '\n'); return 2; }
  const res = await scanRepo({ owner: m[1], repo: m[2], path: p.path });
  const text = JSON.stringify({ repo: res.repo, scan: res.scan, top: res.top }, null, 2) + '\n';
  if (out) writeFileSync(out, text); else process.stdout.write(text);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv).then((c) => { process.exitCode = c; }, (e) => { process.stderr.write('scan: ' + e.message + '\n'); process.exitCode = e instanceof ScanError ? 3 : 1; });
}
