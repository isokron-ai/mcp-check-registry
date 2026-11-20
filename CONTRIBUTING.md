# Contributing

## Listing a server

Use the [Submit your MCP server](../../issues/new?template=submit-server.yml) issue form. Please don't open a pull request that adds an entry by hand: the workflow fills in the scan, the commit and the marks, and a hand-written entry can't be checked against the source.

Only maintainers, or people with the maintainer's permission, should submit. We check before merging.

## Changing a listing

- **Name or description:** edit your submission issue. The workflow updates the same pull request, or opens a new one if the first was merged.
- **Grades:** fix the findings in your repository. The nightly refresh picks up the new default branch; editing the issue scans again right away.
- **Marks:** commit the CI workflow or the claim file to your default branch (see the README).
- **Removal:** see "Removing a listing" in the README.

## Changing the code

Pull requests to `scripts/`, `schema/` and the workflows are welcome.

- Node 22 or later, ES modules, no dependencies besides the pinned `@isokron/mcp-check`.
- `npm test` and `npm run check` must pass. Add a test with each change; tests use mocked GitHub answers and never touch the network.
- Issue text is untrusted. It is read from the event file, validated against strict patterns and escaped before it reaches Markdown. It never reaches a shell.
- The workflows write only to this repository. Nothing here may comment, open issues or push anywhere else.
- Third-party actions are pinned by commit SHA.
- If a change alters the reply text, update the snapshot with `UPDATE_SNAPSHOTS=1 npm test` and review the diff.

Changes to the entry format (`schema/server.schema.json`) need a matching change on the site that renders the listings, so please open an issue first.

## License

By contributing you agree that your contribution is licensed under Apache-2.0.
