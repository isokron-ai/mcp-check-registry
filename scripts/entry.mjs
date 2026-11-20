#!/usr/bin/env node
// entry.mjs: builds or updates a registry entry (contract C2) and validates it against
// schema/server.schema.json. As a command: entry.mjs --check validates every file in servers/.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { loadSchema, validate } from './lib/schema.mjs';
import { LISTING_BASE } from './lib/constants.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** "packages/server-x" -> "packages-server-x": lowercase, one segment, safe in a file name and a URL. */
export function pathSlug(path) {
  return String(path).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').replace(/-{2,}/g, '-');
}

/** Entry id: owner/repo, plus /path for a subfolder listing. */
export const entryId = (fullName, path = '') => fullName + (path ? '/' + path : '');

/** servers/<owner>/<repo>[__<slug>].json, lowercase. */
export function entryFile(fullName, path = '') {
  const [owner, repo] = fullName.toLowerCase().split('/');
  return 'servers/' + owner + '/' + repo + (path ? '__' + pathSlug(path) : '') + '.json';
}

/** Contract C3: https://isokron.ai/mcp-check/registry/<owner>/<repo>[__<slug>], lowercase. */
export function listingUrl(fullName, path = '') {
  const [owner, repo] = fullName.toLowerCase().split('/');
  return LISTING_BASE + '/' + owner + '/' + repo + (path ? '__' + pathSlug(path) : '');
}

/**
 * Builds the entry. With `existing`, the original submission record is kept; name and description
 * come from the newest submission. Throws when the result does not match the schema.
 */
export function buildEntry({ fullName, path = '', name, description, submitted, scan, ci, owner, existing = null, schema = loadSchema() }) {
  const entry = {
    schema: 1,
    id: entryId(fullName, path),
    repo: 'https://github.com/' + fullName,
    path,
    name: name ?? existing?.name,
    description: description ?? existing?.description,
    submitted: existing?.submitted ?? submitted,
    scan,
    ci,
    owner,
  };
  const errors = validate(entry, schema);
  if (errors.length) throw new Error('entry for ' + entry.id + ' does not match the schema:\n  ' + errors.join('\n  '));
  return entry;
}

/** Stable JSON text for an entry file. */
export const entryText = (entry) => JSON.stringify(entry, null, 2) + '\n';

/**
 * True when the refreshed entry differs from the stored one in anything but timestamps and the
 * commit that was read. The nightly refresh only rewrites a file when this is true.
 */
export function materiallyChanged(prev, next) {
  const strip = (e) => {
    const c = structuredClone(e);
    delete c.scan.at; delete c.scan.commit; delete c.ci.checkedAt; delete c.owner.checkedAt;
    return JSON.stringify(c);
  };
  return strip(prev) !== strip(next);
}

/** Every entry file under servers/, as paths relative to the repository root. */
export function listEntryFiles(root = ROOT) {
  const out = [];
  const dir = join(root, 'servers');
  for (const owner of readdirSync(dir).sort()) {
    const od = join(dir, owner);
    if (!statSync(od).isDirectory()) continue;
    for (const f of readdirSync(od).sort()) if (f.endsWith('.json')) out.push(relative(root, join(od, f)));
  }
  return out;
}

/** Validates every entry file: schema, file name and id agree, no duplicate ids. Returns error strings. */
export function checkAll(root = ROOT) {
  const schema = loadSchema();
  const errors = [];
  const seen = new Map();
  for (const f of listEntryFiles(root)) {
    let e;
    try { e = JSON.parse(readFileSync(join(root, f), 'utf8')); } catch (err) { errors.push(f + ': not JSON (' + err.message + ')'); continue; }
    for (const x of validate(e, schema)) errors.push(f + ': ' + x);
    if (typeof e.id === 'string' && typeof e.path === 'string') {
      const full = e.id.split('/').slice(0, 2).join('/');
      if (entryFile(full, e.path) !== f.split('\\').join('/')) errors.push(f + ': file name should be ' + entryFile(full, e.path));
      if (e.id !== entryId(full, e.path)) errors.push(f + ': id and path disagree');
      if (e.repo !== 'https://github.com/' + full) errors.push(f + ': repo and id disagree');
      const k = e.id.toLowerCase();
      if (seen.has(k)) errors.push(f + ': same id as ' + seen.get(k)); else seen.set(k, f);
    }
  }
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  if (process.argv[2] !== '--check') { process.stderr.write('usage: entry.mjs --check\n'); process.exitCode = 2; } else {
    const errors = checkAll();
    if (errors.length) { process.stderr.write(errors.join('\n') + '\n'); process.exitCode = 1; } else process.stdout.write('entries ok: ' + listEntryFiles().length + '\n');
  }
}
