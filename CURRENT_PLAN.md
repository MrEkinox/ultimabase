# Current plan: Core path simplification canaries

- Status: completed
- Milestone: 67
- Active issue: none
- Next issue: none

## Objective

Direct neutral relation queries, nested-write declaration indexes, one-Map
ordering and update-field traversal cleanup are retained without changing DX.
[Issue 6703](issues/6700-core-path-simplification/6703-relation-ordering-traversal-canaries.md)
owns the four trials and evidence; issues 6701 and 6702 remain complete.

## Locked decisions

- No public API, diagnostic, security, Typegen or Runtime capability regression.
- Reuse existing Query AST/input primitives; no new executor or graph.
- Count shared types and adapters, not gross deletions; preserve editor contracts.
- Reject and remove an experiment if parity or worthwhile simplification fails.
- One issue at a time; full validation before retention/commit; no push authorized.

## Blocker

None.

## Next verifiable action

No remaining issue in milestone 67. Full and compiled validation passed.
Await the user's next direction; no push is authorized.
