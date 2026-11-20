<!-- mcp-check-registry:submission -->
## mcp-check results for `isokron-ai/kronicle-lite`

**Kronicle Lite**: 13 tools read from [`6df1964`](https://github.com/isokron-ai/kronicle-lite/tree/6df19640ea1c63aabdbb08aa6135915e5fc0cc63) on `main`, reproduced from the SDK registrations in the source (schemas follow the SDK and may differ in detail).

Nothing was installed, built or run. The checker (`@isokron/mcp-check` 1.0.0, rubric 2.1.0) reads the tool definitions in the source and grades them as text; it never starts or calls your server.

| Section | Grade |
|---|---|
| MCP specification | **A** |
| Claude directory rules | **B** |
| ChatGPT directory rules | **C** |
| Poisoning and hidden text | **A** |
| Schema and description quality | **A** |
| Write-surface design | **F** |

Findings: 9 high, 9 medium, 48 low.

### Top findings

1. **[openai-hints-explicit](https://isokron.ai/mcp-check/checks/openai-hints-explicit?utm_source=mcp-check-registry-bot&utm_medium=action)** (blocking): readOnlyHint, destructiveHint and openWorldHint are explicit booleans. 7 tools: `get_system_state`, `audit_assumptions`, `recall` and 4 more.
2. **[anthropic-description](https://isokron.ai/mcp-check/checks/anthropic-description?utm_source=mcp-check-registry-bot&utm_medium=action)** (blocking): Description says what the tool does and when to use it. 1 tool: `apply`.
3. **[openai-description](https://isokron.ai/mcp-check/checks/openai-description?utm_source=mcp-check-registry-bot&utm_medium=action)** (blocking): Every tool has a non-empty description. 1 tool: `apply`.
4. **[openai-retry](https://isokron.ai/mcp-check/checks/openai-retry?utm_source=mcp-check-registry-bot&utm_medium=action)** (attention): Write tools say whether a retry repeats the effect. 5 tools: `checkpoint_chain`, `put_document`, `supersede_block` and 2 more.
5. **[anthropic-hint-platforms-differ](https://isokron.ai/mcp-check/checks/anthropic-hint-platforms-differ?utm_source=mcp-check-registry-bot&utm_medium=action)** (attention): destructiveHint: false on a write: the platforms word this differently. 2 tools: `checkpoint_chain`, `audit_record`.

Each link explains the check and how to fix it. The full report is on the [checker page](https://isokron.ai/mcp-check?utm_source=mcp-check-registry-bot&utm_medium=action) or from `npx @isokron/mcp-check --repo github.com/isokron-ai/kronicle-lite`.

### Add mcp-check to your CI

**[Add mcp-check to your CI](https://github.com/isokron-ai/kronicle-lite/new/main?filename=.github/workflows/mcp-check.yml&value=name%3A%20MCP%20check%0Aon%3A%0A%20%20push%3A%0A%20%20pull_request%3A%0Apermissions%3A%0A%20%20contents%3A%20read%0Ajobs%3A%0A%20%20mcp-check%3A%0A%20%20%20%20runs-on%3A%20ubuntu-latest%0A%20%20%20%20steps%3A%0A%20%20%20%20%20%20-%20uses%3A%20actions%2Fcheckout%403d3c42e5aac5ba805825da76410c181273ba90b1%20%23%20v7.0.1%0A%20%20%20%20%20%20%20%20with%3A%0A%20%20%20%20%20%20%20%20%20%20persist-credentials%3A%20false%0A%20%20%20%20%20%20-%20uses%3A%20isokron-ai%2Fmcp-check%40v1%0A)**

The link opens GitHub's new-file page in `isokron-ai/kronicle-lite` with `.github/workflows/mcp-check.yml` filled in. Nothing is written to your repository until you review the file and commit it yourself. Without write access, GitHub offers to open a pull request instead.

The workflow checks out your code without keeping credentials, reads the tool definitions from it and grades them on every push and pull request. It runs nothing from your repository and needs read access only. Once it is on `main`, the listing shows **CI-verified** after the next nightly check.

<details><summary>The workflow file</summary>

```yaml
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

</details>

### Claim the listing

Commit this file as `.github/mcp-check/registry.json` on `main` ([open it pre-filled](https://github.com/isokron-ai/kronicle-lite/new/main?filename=.github/mcp-check/registry.json&value=%7B%0A%20%20%22id%22%3A%20%22isokron-ai%2Fkronicle-lite%22%0A%7D%0A)):

```json
{
  "id": "isokron-ai/kronicle-lite"
}
```

The listing shows **Owner-verified** after the next nightly check. There is no sign-in and no app to install: the file on your default branch is the claim. Delete it to drop the mark.

### Your listing

Your listing will be at https://isokron.ai/mcp-check/registry/isokron-ai/kronicle-lite?utm_source=mcp-check-registry-bot&utm_medium=action once #12 is merged and the site rebuilds.
Grades refresh nightly from your default branch. Edit this issue to scan again now. To remove the listing, open a removal request in this repository; it is honored for maintainers.
