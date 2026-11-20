// Parses the "Submit your MCP server" issue form body and validates every field.
// The body is untrusted: anyone can open or edit an issue. It is read from the event file, never
// from a shell, and every value is checked against a strict pattern before it is used.
import { oneLine } from './text.mjs';

export const MAX_BODY = 20000;

/** Headings exactly as the issue form renders them (see .github/ISSUE_TEMPLATE/submit-server.yml). */
export const FIELDS = {
  repository: 'Repository URL',
  path: 'Subfolder path (optional)',
  name: 'Display name',
  description: 'One-line description',
  permission: 'Permission',
};
export const PERMISSION_TEXT = "I maintain this repository or have the maintainer's permission";

const NO_RESPONSE = '_No response_';

/**
 * Splits the body into { heading: value }. Returns { fields, errors }.
 * Unknown or repeated headings are errors: the body must be the form, unedited in shape.
 */
export function parseFormBody(body) {
  const errors = [];
  if (typeof body !== 'string' || !body.trim()) return { fields: {}, errors: ['The issue body is empty. Please use the submission form.'] };
  if (body.length > MAX_BODY) return { fields: {}, errors: ['The issue body is too long. Please use the submission form.'] };
  const known = new Map(Object.entries(FIELDS).map(([k, h]) => [h.toLowerCase(), k]));
  const fields = {};
  let current = null;
  let buf = [];
  const flush = () => {
    if (current) fields[current] = buf.join('\n').trim();
    buf = [];
  };
  for (const raw of body.replace(/\r\n?/g, '\n').split('\n')) {
    const m = /^###[ \t]+(.+?)[ \t]*$/.exec(raw);
    if (m) {
      flush();
      const key = known.get(m[1].trim().toLowerCase());
      if (!key) {
        errors.push('The form has a section it does not expect (' + JSON.stringify(oneLine(m[1], 60)) + '). Please use the submission form.');
        current = null;
        continue;
      }
      if (key in fields) errors.push('The form has the section ' + JSON.stringify(FIELDS[key]) + ' twice.');
      current = key;
      continue;
    }
    if (current) buf.push(raw);
  }
  flush();
  for (const k of Object.keys(fields)) if (fields[k] === NO_RESPONSE) fields[k] = '';
  return { fields, errors };
}

/** Owner and repository name rules from GitHub; the repository may not be "." or "..". */
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

/** Accepts exactly https://github.com/<owner>/<repo> (optional trailing slash or .git). */
export function parseRepoUrl(input) {
  const s = String(input ?? '').trim();
  if (s.length > 300 || /\s/.test(s)) return { error: 'The repository URL must be a single https://github.com/owner/repo link.' };
  const m = /^https:\/\/github\.com\/([^/?#]+)\/([^/?#]+?)(?:\.git)?\/?$/.exec(s);
  if (!m) return { error: 'The repository URL must look like https://github.com/owner/repo (no branches, folders or query strings; put a subfolder in the path field).' };
  const [, owner, repo] = m;
  if (!OWNER_RE.test(owner)) return { error: 'The owner in the repository URL is not a valid GitHub name.' };
  if (!REPO_RE.test(repo) || repo === '.' || repo === '..') return { error: 'The repository name in the URL is not a valid GitHub name.' };
  return { owner, repo };
}

/** A subfolder inside the repository: plain segments, no "..", no leading slash. */
export function parsePath(input) {
  let s = String(input ?? '').trim();
  if (!s) return { path: '' };
  s = s.replace(/^\.?\/+/, '').replace(/\/+$/, '');
  if (!s) return { path: '' };
  if (s.length > 200) return { error: 'The subfolder path is too long (200 characters at most).' };
  const segs = s.split('/');
  if (segs.some((x) => !x || x === '.' || x === '..' || !/^[A-Za-z0-9._@-]+$/.test(x))) {
    return { error: 'The subfolder path may only hold folder names made of letters, digits, ".", "_", "-" and "@", separated by "/".' };
  }
  return { path: segs.join('/') };
}

/** Validates a parsed form. Returns { submission, errors }. */
export function validateSubmission(fields) {
  const errors = [];
  const repo = parseRepoUrl(fields.repository);
  if (repo.error) errors.push(repo.error);
  const path = parsePath(fields.path);
  if (path.error) errors.push(path.error);
  const name = oneLine(fields.name, 1000);
  if (!name) errors.push('The display name is empty.');
  else if (name.length > 80) errors.push('The display name is longer than 80 characters.');
  const description = oneLine(fields.description, 1000);
  if (!description) errors.push('The one-line description is empty.');
  else if (description.length > 200) errors.push('The description is longer than 200 characters.');
  const perm = String(fields.permission ?? '');
  const ticked = perm.split('\n').some((l) => /^\s*[-*]\s+\[[xX]\]\s+/.test(l) && l.includes(PERMISSION_TEXT));
  if (!ticked) errors.push("The box \"" + PERMISSION_TEXT + "\" is not ticked. Only maintainers, or people with the maintainer's permission, can list a server.");
  if (errors.length) return { submission: null, errors };
  return { submission: { owner: repo.owner, repo: repo.repo, path: path.path, name, description }, errors };
}
