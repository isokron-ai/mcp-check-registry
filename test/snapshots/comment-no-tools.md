<!-- mcp-check-registry:submission -->
## No tool definitions found in `isokron-ai/sea-lite`

The checker reads tool definitions straight from the source and runs nothing. It read [`b536cc1`](https://github.com/isokron-ai/sea-lite/tree/b536cc18d7eeb43a16da3d3bb1f88edfa6df3eb3) on `main` and found none (scanned 54 of 54 source files). That usually means the tools are built at run time in a way a static reader can't follow: generated from an API description, loaded from configuration, or registered through a wrapper.

You can still be listed:

1. On your machine, save your server's tool list: `npx @isokron/mcp-check capture -- <command that starts your server> > tools.json`. This starts your server locally and asks it for its tools/list only; no tool is called.
2. Commit `tools.json` to the repository (in the root, or in the folder you listed). The static reader uses a committed tool list as is.
3. Edit this issue (any change) and the check runs again.

In your own CI, the Action can also grade the live list: set `tools-file: tools.json`, or `command:` with the command that starts your server.

How grading works: https://isokron.ai/mcp-check?utm_source=github&utm_medium=registry&utm_campaign=registry
