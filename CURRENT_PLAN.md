# Current plan: Core path simplification canaries

- Status: completed
- Milestone: 67
- Active issue: none
- Next issue: none

## Objective

The published type-utility trial in
[issue 6704](issues/6700-core-path-simplification/6704-type-utility-library-canary.md)
was rejected: six production lines saved did not justify the dependency.
All experiment code was rolled back; original declarations are unchanged.
The eleven trials in issues 6701–6703 remain complete.

## Locked decisions

- No public API, diagnostic, security, Typegen or Runtime capability regression.
- Reuse existing Query AST/input primitives; no new executor or graph.
- Count shared types and adapters, not gross deletions; preserve editor contracts.
- Reject and remove an experiment if parity or worthwhile simplification fails.
- One issue at a time; full validation before retention/commit; no push authorized.

## Blocker

None.

## Next verifiable action

No remaining trial in milestone 67. Await the user's next direction.
No push is authorized.
