// Shared test helpers: form bodies, a fixed clock, and an in-memory GitHub for the write paths.
import { readFileSync } from 'node:fs';

export const fixture = (name) => JSON.parse(readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8'));
export const NOW = () => new Date('2026-11-20T12:00:00.000Z');

/** An issue form body as GitHub renders it. */
export function formBody({ repository = 'https://github.com/acme/weather-mcp', path = '_No response_', name = 'Weather MCP', description = 'Forecasts and alerts for agents.', ticked = true } = {}) {
  return [
    '### Repository URL', '', repository, '',
    '### Subfolder path (optional)', '', path, '',
    '### Display name', '', name, '',
    '### One-line description', '', description, '',
    '### Permission', '', '- [' + (ticked ? 'X' : ' ') + "] I maintain this repository or have the maintainer's permission", '',
  ].join('\n');
}

/** A mocked fetch over a map of "METHOD url" or "url" -> { status, body } (body string or JSON). */
export function mockFetch(routes, calls = []) {
  return async (url, init = {}) => {
    const method = init.method || 'GET';
    calls.push({ method, url, headers: init.headers, body: init.body });
    const r = routes[method + ' ' + url] ?? routes[url];
    const res = typeof r === 'function' ? r(url, init) : r;
    if (!res) return new Response('{"message":"Not Found"}', { status: 404 });
    const body = typeof res.body === 'string' ? res.body : JSON.stringify(res.body ?? {});
    return new Response(body, { status: res.status ?? 200 });
  };
}

/** An in-memory GitHub with just the calls the submission and refresh scripts make. */
export function fakeGitHub({ files = {} } = {}) {
  let seq = 100;
  const state = {
    comments: [], labels: new Set(), pulls: [], refs: { main: 'c0' },
    commits: { c0: { tree: 't0', parents: [], files: { ...files } } }, trees: { t0: { ...files } },
    log: [],
  };
  const gh = {
    state,
    listIssueComments: async () => state.comments.map((c) => ({ ...c })),
    createIssueComment: async (full, n, body) => { const c = { id: ++seq, issue: n, body, user: { login: 'github-actions[bot]' } }; state.comments.push(c); state.log.push('comment+'); return c; },
    updateIssueComment: async (full, id, body) => { const c = state.comments.find((x) => x.id === id); c.body = body; state.log.push('comment~'); return c; },
    addLabels: async (full, n, ls) => { ls.forEach((l) => state.labels.add(l)); },
    removeLabel: async (full, n, l) => { state.labels.delete(l); },
    getFile: async (full, path, ref) => { const f = state.trees[state.commits[state.refs[ref]]?.tree]?.[path]; return f ?? null; },
    getRef: async (full, b) => (state.refs[b] ? { object: { sha: state.refs[b] } } : null),
    compare: async (full, base, head) => {
      const bf = state.trees[state.commits[state.refs[base]].tree];
      const hf = state.trees[state.commits[head].tree];
      const filesOut = Object.keys(hf).filter((k) => !(k in bf)).map((k) => ({ filename: k, status: 'added' }));
      return { behind_by: 0, files: filesOut };
    },
    getCommit: async (full, sha) => ({ sha, tree: { sha: state.commits[sha].tree } }),
    createTree: async (full, base, tree) => {
      const t = { ...state.trees[base] };
      for (const e of tree) { if (e.sha === null) delete t[e.path]; else t[e.path] = e.content; }
      const id = 't' + (++seq); state.trees[id] = t; return { sha: id };
    },
    createCommit: async (full, message, tree, parents) => { const id = 'c' + (++seq); state.commits[id] = { tree, parents, message }; return { sha: id }; },
    createRef: async (full, b, sha) => { state.refs[b] = sha; state.log.push('ref+ ' + b); },
    updateRef: async (full, b, sha) => { state.refs[b] = sha; state.log.push('ref~ ' + b); },
    listPulls: async (full, q) => state.pulls.filter((p) => p.state === 'open' && (!q.head || q.head === 'isokron-ai:' + p.head)),
    createPull: async (full, p) => { const pr = { number: ++seq, state: 'open', ...p }; state.pulls.push(pr); state.log.push('pr+'); return pr; },
    updatePull: async (full, n, p) => { Object.assign(state.pulls.find((x) => x.number === n), p); state.log.push('pr~'); },
  };
  return gh;
}
