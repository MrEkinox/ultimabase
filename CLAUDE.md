# Claude Code guide

@AGENTS.md

The imported [AGENTS.md](AGENTS.md) is the project contract and wins over
anything below.

## Working agreement

- Answer the user in French; write code, comments, commits and repository
  documentation in English.
- Start every task by stating a verifiable "done" criterion.
- Prove, do not assert: quote the command and its result for every claim of
  success. A check that was not run is reported as not run.
- Disagree when warranted, and explain why.

## Authorizations

- Pushing, publishing, opening or merging pull requests, changing GitHub
  settings, force-pushing and deleting branches require explicit user
  confirmation every time.
- `main` of `MrEkinox/ultimadatabase` is never rewritten without explicit
  confirmation. The `*-archive` tags are never moved.

## Project hook

`.claude/settings.json` runs Prettier on every file Claude writes or edits
inside the repository. Formatting is still verified by `yarn format:check`.
