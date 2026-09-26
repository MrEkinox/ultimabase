# Current plan: Authoring and repetition consolidation

- Status: in progress
- Milestone: 39
- Baseline: `776b533c`
- Current issue: 3902 (completed)

The user authorized the next debt and DX reduction sequence on 2026-09-25 while
retaining every functional capability.

Issue 3901 replaced Core's separate plugin field-type and contextual builder
declarations with one field-family definition. It was completed in commit
`c4b21572`.

Issue 3902 consolidated the repeated prepared-mutation adapter and transaction
plumbing used by the Access, Hooks, REST, and GraphQL schema-mutation tests. The
shared fixture is repository-internal test tooling; each package retains its
own rows, prepared effects, traces, and behavioral assertions.

Later bounded issues will address built-in scalar factory typing and remaining
internal mapping or registry duplication. Each issue keeps its own commit and
validation evidence.

Resume by selecting the built-in scalar factory typing issue and first capture
the exact source and compiled hover baseline before changing its declarations.

No push is authorized.
