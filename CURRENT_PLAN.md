# Current plan: Core path simplification canaries

- Status: completed
- Milestone: 67
- Active issue: none
- Next issue: none

## Objective

Direct mutation normalization, schema publication, enum factory contracts,
and shared filter compatibility are retained after full and compiled validation.
[Issue 6701](issues/6700-core-path-simplification/6701-core-canaries.md) owns evidence.

## Locked decisions

- No public API, diagnostic, security, Typegen or Runtime capability regression.
- Reuse existing normalized Query input; no new executor or graph.
- Count shared types and adapters, not gross deletions; preserve editor contracts.
- Reject and remove an experiment if parity or worthwhile simplification fails.
- One issue at a time; full validation before retention/commit; no push authorized.

## Blocker

None.

## Next verifiable action

No remaining issue in milestone 67. Await the user's next direction;
no push is authorized.
