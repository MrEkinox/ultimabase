# Current plan: Standard package simplification

- Status: in-progress
- Milestone: 65
- Active issue: 6503
- Next issue: none

## Objective

Test Valibot, GraphQL Tools and atomic writing in that order. Retain only
behavior-preserving replacements that reduce maintenance or net complexity.
The [milestone](issues/6500-standard-package-simplification/README.md) owns evidence.

## Locked decisions

- No public API, diagnostic, security, Typegen or Runtime capability regression.
- Count replacement schemas, compatibility code and dependencies, not gross deletions.
- Reject and remove an experiment if parity or worthwhile simplification fails.
- One issue at a time; full validation before retention/commit; no push authorized.

## Blocker

None.

## Next verifiable action

GraphQL Tools retained: production -99 lines; full validation and packed GraphQL/
Yoga checks green. Prove atomic writer parity in an isolated temporary canary.
