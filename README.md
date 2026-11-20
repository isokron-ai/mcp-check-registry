# MCP check registry

A public list of MCP servers whose maintainers asked to be listed. Each listing shows how the server's tools grade against the MCP specification, the Claude and ChatGPT directory rules, hidden-instruction patterns, schema quality and write-surface design, plus two marks: **CI-verified** and **Owner-verified**.

The listings are published at [isokron.ai/mcp-check/registry](https://isokron.ai/mcp-check/registry?utm_source=mcp-check-registry-readme&utm_medium=readme). This repository holds the data (`servers/`), the submission form and the workflows that grade and refresh it.

## Who can list a server

Maintainers of a public GitHub repository that holds an MCP server, or someone with the maintainer's permission. Listing is opt-in: we only list servers that are submitted here, and our own. We do not open pull requests or comment in other people's repositories.

To list a server, open a [Submit your MCP server](../../issues/new?template=submit-server.yml) issue. You give the repository URL, an optional subfolder for a monorepo, a display name and a one-line description.

## How grading works

The submission workflow reads the tool definitions from the repository's source with [`@isokron/mcp-check`](https://github.com/isokron-ai/mcp-check), the same engine as the [web checker](https://isokron.ai/mcp-check?utm_source=mcp-check-registry-readme&utm_medium=readme), the CLI and the GitHub Action. It reads the default branch at a fixed commit, as text:

- a committed tool list (`tools.json`, tool snapshots or an MCPB manifest), used as is;
- otherwise tool definitions written as literals in the source, or reproduced from SDK registrations.

**Nothing is ever run.** The repository is not installed, built or started, and no tool is called. Each listing records which of the above it came from, the commit, and the checker and rubric versions.

It then replies on the issue with:

- the grade for each section and the finding counts;
- the top findings, each linked to the page that explains the check and the fix;
- a one-click link that adds mcp-check to your CI (see below);
- the claim file to commit (see below);
- the listing URL.

It also opens a pull request that adds `servers/<owner>/<repo>.json`. We review it and merge; the site picks it up on its next build. Edit your issue at any time to scan again.

### Not graded yet

If no tool definitions are found in the source (tools built at run time, loaded from configuration or registered through a wrapper), the server is **not graded yet**. Entries in that state carry `scan.status: "no-tools"` and no grades. To get a grade:

1. Save your server's tool list on your machine: `npx @isokron/mcp-check capture -- <command that starts your server> > tools.json`. This starts your server locally and asks it for its tools/list only; no tool is called.
2. Commit `tools.json` to the repository (in the root, or in the listed folder). The static reader uses a committed tool list as is.
3. Edit your submission issue to scan again, or wait for the nightly refresh.

In your own CI, the Action can also grade the live list: set `tools-file: tools.json`, or `command:` with the command that starts your server.

Severity counts use the checker's levels: **high** is a blocking item, **medium** needs attention, **low** is advice.

## CI-verified

A listing is CI-verified when a workflow on the default branch uses `isokron-ai/mcp-check`. The reply's **Add mcp-check to your CI** link opens GitHub's new-file page in your repository with this file filled in:

```yaml
# .github/workflows/mcp-check.yml
name: MCP check
on:
  push:
  pull_request:
permissions:
  contents: read
jobs:
  mcp-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: isokron-ai/mcp-check@v1
```

Nothing is written to your repository until you review the file and commit it. With neither `tools-file` nor `command` set, the Action reads the tool definitions from the checked-out source and runs nothing. Every pull request in your repository then gets the grades in its job summary.

For a folder listing in a monorepo, the link adds the folder to the mcp-check step, so the Action reads only that folder:

```yaml
      - uses: isokron-ai/mcp-check@v1
        with:
          working-directory: "packages/server"
```

## Owner-verified (claiming a listing)

Commit `.github/mcp-check/registry.json` to the default branch, naming the listing:

```json
{
  "id": "owner/repo"
}
```

For a folder listing in a monorepo, add the folder: `{"id": "owner/repo", "path": "packages/server"}`. The id is lower-case. There is no sign-in and nothing to install: the file on the default branch is the claim. Delete it to drop the mark.

## Refreshes

Every night a workflow re-reads each listed server's source and its CI and claim files, and opens one pull request in this repository with the entries that changed. An entry is rewritten only when its grades, tool list, finding counts or marks change, so `scan.at` and the `checkedAt` dates are the last time something changed. A failed read keeps the stored values; it never drops a mark.

## Removing a listing

Open a [Remove a listing](../../issues/new?template=remove-listing.yml) issue, or a pull request that deletes the entry file. Removal is honored for the repository's maintainers. Archived or deleted repositories are removed on review.

## Entry format

One JSON file per listing: `servers/<owner>/<repo>.json`, or `servers/<owner>/<repo>__<path-slug>.json` for a folder in a monorepo, where the slug is the folder path lower-cased with every character outside `a-z` and `0-9` turned into `-` (`packages/Server_X` becomes `packages-server-x`). The listing page uses the same slug. Ids, file names and listing URLs are all lower-case; `id` is `owner/repo` for folder listings too, with the folder in `path`. Each entry also records the repository's `defaultBranch`, for the one-click links. Seed entries for our own servers have `submitted.issue: null`. [`schema/server.schema.json`](schema/server.schema.json) is the JSON Schema; `npm run check` validates every entry.

## Working on this repository

Node 22 or later. The only dependency is `@isokron/mcp-check`, pinned to an exact version.

```sh
npm ci --ignore-scripts
npm test                                 # unit tests, no network
npm run check                            # validate every entry in servers/
node scripts/scan.mjs owner/repo         # scan one repository (reads public source via GitHub's API)
node scripts/verify.mjs owner/repo       # read its CI and claim marks
node scripts/refresh.mjs                 # dry run of the nightly refresh; --write updates files here
```

Set `GITHUB_TOKEN` for GitHub's API rate limits. It is passed to the checker by environment variable name and never printed.

## License

Apache-2.0. See [LICENSE](LICENSE).

---

Built and maintained by [IsoKron](https://isokron.ai?utm_source=mcp-check-registry-readme&utm_medium=readme).
