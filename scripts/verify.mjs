#!/usr/bin/env node
// verify.mjs <owner/repo> [--path folder]
// Computes the ci and owner blocks of a registry entry (contract C2) from files on the default branch:
//   ci     any .github/workflows/*.yml|yaml that has a step "uses: isokron-ai/mcp-check@..."
//   owner  .github/mcp-check/registry.json exists and names this entry: {"id": "owner/repo"},
//          plus "path": "<folder>" for a folder listing
// Reads public files through GitHub's contents API only. Nothing is written anywhere.
import { pathToFileURL } from 'node:url';
import { github } from './lib/github.mjs';
import { CLAIM_PATH } from './lib/constants.mjs';

const USES_RE = /^[ \t]*(?:-[ \t]+)?uses:[ \t]*["']?isokron-ai\/mcp-check@[^\s"'#]+/im;
const MAX_WORKFLOWS = 50;

/** True when a workflow file's text has a step that uses the Action (comments don't count). */
export const usesMcpCheck = (yaml) => USES_RE.test(String(yaml));

const normPath = (p) => String(p).trim().replace(/^\.?\/+/, '').replace(/\/+$/, '').toLowerCase();

/**
 * True when the claim file is {"id": "<owner/repo>"} for this entry, plus "path": "<folder>" when
 * the entry is a folder listing. Case-insensitive; leading "./" and slashes around the path are ignored.
 */
export function claimNames(text, id, path = '') {
  let j;
  try { j = JSON.parse(text); } catch { return false; }
  if (!j || typeof j !== 'object' || Array.isArray(j) || typeof j.id !== 'string') return false;
  if (j.id.trim().toLowerCase() !== id.toLowerCase()) return false;
  if (j.path !== undefined && typeof j.path !== 'string') return false;
  return normPath(j.path ?? '') === normPath(path);
}

/**
 * Returns { ci, owner }. GitHub errors other than "not found" are thrown, so a caller can keep
 * the previous values instead of dropping a mark on a transient failure.
 */
export async function verify({ full, branch, id, path = '', gh = github(), now = () => new Date() }) {
  const at = now().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const ci = { verified: false, checkedAt: at, workflow: '' };
  const dir = await gh.listDir(full, '.github/workflows', branch);
  if (Array.isArray(dir)) {
    const files = dir.filter((f) => f && f.type === 'file' && /^[A-Za-z0-9._-]+\.ya?ml$/.test(f.name)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_WORKFLOWS);
    for (const f of files) {
      let text = null;
      try { text = await gh.getFile(full, '.github/workflows/' + f.name, branch); } catch (e) { if (e.status !== 413) throw e; }
      if (text != null && usesMcpCheck(text)) { ci.verified = true; ci.workflow = '.github/workflows/' + f.name; break; }
    }
  }
  const owner = { verified: false, checkedAt: at, method: '' };
  let claim = null;
  try { claim = await gh.getFile(full, CLAIM_PATH, branch, 64 * 1024); } catch (e) { if (e.status !== 413) throw e; }
  if (claim != null && claimNames(claim, id, path)) { owner.verified = true; owner.method = 'claim-file'; }
  return { ci, owner };
}

async function main(argv) {
  const args = argv.slice(2);
  const full = args[0];
  const pathAt = args.indexOf('--path');
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(full || '')) { process.stderr.write('usage: verify.mjs <owner/repo> [--path folder]\n'); return 2; }
  const gh = github();
  const repo = await gh.getRepo(full);
  if (!repo) { process.stderr.write('verify: ' + full + ' not found\n'); return 3; }
  const out = await verify({ full: repo.full_name, branch: repo.default_branch, id: repo.full_name.toLowerCase(), path: pathAt > 0 ? args[pathAt + 1] : '', gh });
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv).then((c) => { process.exitCode = c; }, (e) => { process.stderr.write('verify: ' + e.message + '\n'); process.exitCode = 1; });
}
