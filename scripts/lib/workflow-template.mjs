// Contract C1: the zero-config workflow, and the one-click GitHub links that pre-fill it.
import { PINS, WORKFLOW_PATH, CLAIM_PATH } from './constants.mjs';

const pin = (p) => p.ref + (p.label ? ' # ' + p.label : '');

/** The workflow file exactly as the one-click link and the docs install it. */
export function workflowYaml(pins = PINS) {
  return [
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
    '',
  ].join('\n');
}

/** The claim file: committing it to the default branch marks the listing owner-verified. */
export function claimJson(id) {
  return JSON.stringify({ id }, null, 2) + '\n';
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

export const addToCiUrl = ({ owner, repo, branch }) => newFileUrl({ owner, repo, branch, filename: WORKFLOW_PATH, value: workflowYaml() });
export const claimUrl = ({ owner, repo, branch, id }) => newFileUrl({ owner, repo, branch, filename: CLAIM_PATH, value: claimJson(id) });
