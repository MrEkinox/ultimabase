# Current plan: Standard package simplification

- Status: in-progress
- Milestone: 65
- Active issue: 6502
- Next issue: 6503

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

Valibot canary rejected with no production/dependency change; full baseline is
green. Prove GraphQL Tools reference rewiring against actual composition consumers.
