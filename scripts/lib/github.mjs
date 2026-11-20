// A small GitHub REST client. fetch is injectable so tests run without the network.
// The token is only ever sent to api.github.com and never printed.

export class GitHubError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export function github({ token = process.env.GITHUB_TOKEN, fetch: f = globalThis.fetch, base = 'https://api.github.com' } = {}) {
  async function request(method, path, { body, accept = 'application/vnd.github+json', raw = false, maxBytes = 2 * 1024 * 1024 } = {}) {
    if (!path.startsWith('/')) throw new Error('path must start with /');
    const headers = { accept, 'x-github-api-version': '2022-11-28', 'user-agent': 'mcp-check-registry' };
    if (token) headers.authorization = 'Bearer ' + token;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await f(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'follow' });
    const text = await res.text();
    if (text.length > maxBytes) throw new GitHubError(method + ' ' + path + ': answer larger than ' + maxBytes + ' bytes', 413);
    if (res.status === 404) return null;
    if (!res.ok) {
      let msg = '';
      try { msg = JSON.parse(text).message || ''; } catch { /* not JSON */ }
      throw new GitHubError(method + ' ' + path + ': HTTP ' + res.status + (msg ? ' (' + String(msg).slice(0, 200) + ')' : ''), res.status);
    }
    if (raw) return text;
    return text ? JSON.parse(text) : {};
  }
  const enc = (s) => encodeURIComponent(s);
  const encPath = (p) => p.split('/').map(enc).join('/');
  const repoPath = (full) => '/repos/' + full.split('/').map(enc).join('/');

  return {
    request,
    getRepo: (full) => request('GET', repoPath(full)),
    getBranchHead: async (full, branch) => {
      const c = await request('GET', repoPath(full) + '/commits/' + enc(branch));
      return c && c.sha;
    },
    /** Directory listing on a ref, or null when the folder is missing. */
    listDir: (full, dir, ref) => request('GET', repoPath(full) + '/contents/' + encPath(dir) + '?ref=' + enc(ref)),
    /** File text on a ref, or null when it is missing. */
    getFile: (full, file, ref, maxBytes = 256 * 1024) => request('GET', repoPath(full) + '/contents/' + encPath(file) + '?ref=' + enc(ref), { accept: 'application/vnd.github.raw+json', raw: true, maxBytes }),

    // Writes, used on this registry repository only.
    listIssueComments: (full, n) => request('GET', repoPath(full) + '/issues/' + n + '/comments?per_page=100'),
    createIssueComment: (full, n, body) => request('POST', repoPath(full) + '/issues/' + n + '/comments', { body: { body } }),
    updateIssueComment: (full, id, body) => request('PATCH', repoPath(full) + '/issues/comments/' + id, { body: { body } }),
    addLabels: (full, n, labels) => request('POST', repoPath(full) + '/issues/' + n + '/labels', { body: { labels } }),
    removeLabel: (full, n, label) => request('DELETE', repoPath(full) + '/issues/' + n + '/labels/' + enc(label)),
    getRef: (full, branch) => request('GET', repoPath(full) + '/git/ref/heads/' + encPath(branch)),
    getCommit: (full, sha) => request('GET', repoPath(full) + '/git/commits/' + enc(sha)),
    createTree: (full, baseTree, tree) => request('POST', repoPath(full) + '/git/trees', { body: { base_tree: baseTree, tree } }),
    createCommit: (full, message, tree, parents) => request('POST', repoPath(full) + '/git/commits', { body: { message, tree, parents } }),
    createRef: (full, branch, sha) => request('POST', repoPath(full) + '/git/refs', { body: { ref: 'refs/heads/' + branch, sha } }),
    updateRef: (full, branch, sha) => request('PATCH', repoPath(full) + '/git/refs/heads/' + encPath(branch), { body: { sha, force: false } }),
    compare: (full, base, head) => request('GET', repoPath(full) + '/compare/' + enc(base) + '...' + enc(head)),
    listPulls: (full, q) => request('GET', repoPath(full) + '/pulls?' + new URLSearchParams(q).toString()),
    createPull: (full, p) => request('POST', repoPath(full) + '/pulls', { body: p }),
    updatePull: (full, n, p) => request('PATCH', repoPath(full) + '/pulls/' + n, { body: p }),
  };
}

/**
 * Commits files to a branch of this repository in one commit, without force.
 * files: { path: string | null } (null deletes). A new branch starts from base; an existing one
 * gets a commit on its tip, and when base has moved on, that commit also merges base in, so the
 * pull request only ever shows the entry files.
 */
export async function commitFiles(gh, full, { base, branch, files, message }) {
  const baseRef = await gh.getRef(full, base);
  if (!baseRef) throw new Error('base branch ' + base + ' not found');
  const baseSha = baseRef.object.sha;
  const existing = await gh.getRef(full, branch);
  let parents;
  let fromSha;
  if (!existing) { parents = [baseSha]; fromSha = baseSha; } else {
    const tip = existing.object.sha;
    const cmp = await gh.compare(full, base, tip);
    parents = cmp && cmp.behind_by > 0 ? [tip, baseSha] : [tip];
    fromSha = parents.length > 1 ? baseSha : tip;
  }
  const from = await gh.getCommit(full, fromSha);
  const tree = Object.entries(files).map(([path, content]) => (content === null
    ? { path, mode: '100644', type: 'blob', sha: null }
    : { path, mode: '100644', type: 'blob', content }));
  const t = await gh.createTree(full, from.tree.sha, tree);
  if (t.sha === from.tree.sha && parents.length === 1 && existing) return { sha: existing.object.sha, changed: false, created: false };
  const c = await gh.createCommit(full, message, t.sha, parents);
  if (existing) await gh.updateRef(full, branch, c.sha); else await gh.createRef(full, branch, c.sha);
  return { sha: c.sha, changed: true, created: !existing };
}
