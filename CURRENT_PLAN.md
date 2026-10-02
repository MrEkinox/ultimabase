# Current plan: Core path simplification canaries

- Status: completed
- Milestone: 67
- Active issue: none
- Next issue: none

## Objective

Direct persisted-model commands, simpler inclusion normalization and shared
result classification are retained without changing capabilities or public DX.
[Issue 6702](issues/6700-core-path-simplification/6702-model-inclusion-result-canaries.md)
owns the three trials and evidence; issue 6701's completed changes remain intact.

## Locked decisions

- No public API, diagnostic, security, Typegen or Runtime capability regression.
- Reuse existing normalized Query input; no new executor or graph.
- Count shared types and adapters, not gross deletions; preserve editor contracts.
- Reject and remove an experiment if parity or worthwhile simplification fails.
- One issue at a time; full validation before retention/commit; no push authorized.

## Blocker

None.

## Next verifiable action

No remaining issue in milestone 67. Full and compiled validation passed.
Await the user's next direction; no push is authorized.
