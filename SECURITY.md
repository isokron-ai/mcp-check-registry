# Security policy

Report a vulnerability in this repository's workflows or scripts privately through GitHub: **Security > Report a vulnerability**. Please don't open a public issue. Include the steps to reproduce and the impact you see.

What the workflows do, so you can judge a report:

- The submission workflow reads the issue from the event file, never from a shell. It validates every field and escapes all submitted text before it reaches Markdown.
- The checker reads a submitted repository's public source as text. It never installs, builds or runs anything from it.
- The workflow token can write to this repository only: one comment and labels on the submission issue, one branch and one pull request per submission, and one refresh pull request per night. Checkouts keep no credentials, and every third-party action is pinned by commit SHA.

For the checker itself (`@isokron/mcp-check` and the GitHub Action), see [its security policy](https://github.com/isokron-ai/mcp-check/blob/main/SECURITY.md).
