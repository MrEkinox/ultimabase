# Milestone 66: Standard mechanics canaries

- Status: completed
- Goal: retain smaller standard-library replacements only after actual-consumer parity.

## Execution order

- [x] [6601: Test field collection and repository discovery](6601-standard-mechanics.md)
- [x] [6602: Test file crawling and cookie-route simplification](6602-discovery-and-cookie-canaries.md)

## Outcome

Retain GraphQL Tools field collection: production TypeScript net -45, tests
net +104, no new dependency. Reject native glob/recursive discovery and Manypkg
on proven boundary mismatches. Full validation and affected packed transports
pass; [the issue](6601-standard-mechanics.md) records coverage and exact evidence.

The user approved a follow-up fdir and Password Auth duplication canary.
[Issue 6602](6602-discovery-and-cookie-canaries.md) owns its independent proof.
Retain the cookie-route simplification: production net -31, tests net +31,
no new dependency; full validation and rebuilt HTTP/PostgreSQL checks pass.
Reject fdir because retaining recursive ordering would need an adaptation layer.

## Boundary

The user approved these canaries on 2026-10-02. Preserve public behavior,
diagnostics, capabilities, test discovery and Node 24.0 compatibility. Count
adapters and dependency cost, not gross deletions. No push is authorized.
