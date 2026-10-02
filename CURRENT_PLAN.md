# Current plan: Standard mechanics canaries

- Status: completed
- Milestone: 66
- Active issue: none
- Next issue: none

## Objective

Test GraphQL field collection, native file globbing and workspace inventory.
Retain only behavior-preserving replacements that reduce net complexity.
The [issue](issues/6600-standard-mechanics-canaries/6601-standard-mechanics.md) owns evidence.

## Locked decisions

- No public API, diagnostic, security, Typegen or Runtime capability regression.
- Count replacement schemas, compatibility code and dependencies, not gross deletions.
- Reject and remove an experiment if parity or worthwhile simplification fails.
- One issue at a time; full validation before retention/commit; no push authorized.

## Blocker

None.

## Next verifiable action

None scheduled. GraphQL collector retained and fully validated; native discovery
and Manypkg rejected. Issue 6601 owns the final audit and exact coverage evidence.
