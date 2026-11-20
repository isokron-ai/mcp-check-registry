// Contract C1: the zero-config workflow, and the one-click GitHub links that pre-fill it.
import { PINS, WORKFLOW_PATH, CLAIM_PATH } from './constants.mjs';

const pin = (p) => p.ref + (p.label ? ' # ' + p.label : '');

/**
 * A YAML double-quoted scalar. JSON string syntax is valid YAML double-quoted syntax, so any
 * folder name (spaces, "@", quotes, "#", ":") stays one plain string.
 */
export const yamlQuote = (s) => JSON.stringify(String(s));

/**
 * The workflow file exactly as the one-click link and the docs install it: contract C1 for a
 * repository-root listing; a folder listing adds working-directory under the mcp-check step.
 */
export function workflowYaml(pins = PINS, { path = '' } = {}) {
  const lines = [
    'name: MCP check',
    'on:',
    '  push:',
    '  pull_request:',
    'permissions:',
    '  contents: read',
    'jobs:',
    '  mcp-check:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@' + pin(pins.checkout),
    '        with:',
    '          persist-credentials: false',
    '      - uses: isokron-ai/mcp-check@' + pin(pins.mcpCheck),
  ];
  if (path) lines.push('        with:', '          working-directory: ' + yamlQuote(path));
  return lines.concat('').join('\n');
}

/** The claim file: committing it to the default branch marks the listing owner-verified. */
export function claimJson(id, path = '') {
  return JSON.stringify(path ? { id, path } : { id }, null, 2) + '\n';
}

/** A branch name in a URL path: each part encoded, slashes kept. */
const encBranch = (b) => b.split('/').map(encodeURIComponent).join('/');

/**
 * GitHub's new-file page with the file pre-filled. Nothing is written until the person commits;
 * without write access GitHub offers to fork and open a pull request.
 */
export function newFileUrl({ owner, repo, branch, filename, value }) {
  const q = 'filename=' + encodeURIComponent(filename).replace(/%2F/g, '/') + '&value=' + encodeURIComponent(value);
  return 'https://github.com/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/new/' + encBranch(branch) + '?' + q;
}

export const addToCiUrl = ({ owner, repo, branch, path = '' }) => newFileUrl({ owner, repo, branch, filename: WORKFLOW_PATH, value: workflowYaml(PINS, { path }) });
export const claimUrl = ({ owner, repo, branch, id, path = '' }) => newFileUrl({ owner, repo, branch, filename: CLAIM_PATH, value: claimJson(id, path) });
