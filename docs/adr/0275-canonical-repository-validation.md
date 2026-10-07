# ADR-0275: Local and hosted validation share one contract

- Status: accepted
- Date: 2026-09-28
- Extends: ADR-0251
- Approval: user authorized the complete future-complexity reduction milestone on 2026-09-28

## Context

Repository completion guidance named typecheck, tests, lint, build, and complete
coverage independently. Formatting was enforced by GitHub's affected-file
runner but was not part of the ordinary agent completion command. A locally
validated formatting repair consequently failed remotely, and the subsequent
repository-wide check exposed other files that no recent affected diff had
selected.

Maintaining separate prose lists for contributors, coding agents, and CI allows
the definition of validity to drift. Replacing ADR-0251's affected scheduling
with unconditional complete execution would restore parity by discarding its
proven feedback and resource benefits.

## Decision

The root `yarn validate` command is the canonical ordinary repository contract.
It runs formatting, typecheck, unit/type/performance tests, lint, and build in
that order. `yarn validate:full` extends the same command with complete
source-mode coverage, issue metadata, dependency constraints, and public
documentation validation. Debt reduction and behavior-preserving refactors
must pass the full command before completion or commit.

ADR-0251's affected GitHub scheduling remains. Partial runs may scope formatting,
types, lint, and tests to changed owners. A complete GitHub plan must invoke the
same repository-wide `format:check` command used by local validation, even when
the triggering event supplies no changed-file list. GitHub retains its existing
two-worker complete-coverage bound while local coverage retains four workers.

Release-only publication, packed artifacts, and browser deployment checks keep
their dedicated commands. The validation commands compose existing gates; they
do not replace test discovery, thresholds, selection, or release policy.

## Consequences

- Contributors and agents can name one ordinary and one complete command instead
  of reproducing an error-prone checklist.
- Manual complete GitHub runs cannot silently skip repository formatting.
- A partial CI run remains an explicitly scoped proof rather than pretending to
  be complete coverage.
- Adding or removing a mandatory completion gate requires updating the canonical
  command and this decision rather than several independent instructions.

## Rejected alternatives

- Running complete coverage for every affected change would erase ADR-0251's
  intentional scheduling distinction.
- A new task-graph dependency would add infrastructure without changing the
  small sequential validation contract.
- Keeping formatting outside local completion would preserve the demonstrated
  local/hosted mismatch.
