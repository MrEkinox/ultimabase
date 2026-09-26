# Current plan: Authoring and repetition consolidation

- Status: in progress
- Milestone: 39
- Baseline: `776b533c`
- Current issue: 3903 (completed)

The user authorized the next debt and DX reduction sequence on 2026-09-25 while
retaining every functional capability.

Issue 3901 replaced Core's separate plugin field-type and contextual builder
declarations with one field-family definition. It was completed in commit
`c4b21572`.

Issue 3902 consolidated the repeated prepared-mutation adapter and transaction
plumbing used by the Access, Hooks, REST, and GraphQL schema-mutation tests. The
shared fixture is repository-internal test tooling; each package retains its
own rows, prepared effects, traces, and behavioral assertions.

Issue 3903 preserved the explicit built-in scalar factory aliases as a
deliberate TypeScript hover boundary. It instead consolidates GraphQL's repeated
scalar kind-to-type switches and supported-kind sets behind one internal map,
without changing a public export, source hover, or compiled hover.

Later bounded issues will address remaining internal registry duplication and
the complete parity and reduction audit. Each issue keeps its own commit and
validation evidence.

Resume by selecting the remaining internal registry consolidation issue and
rejecting any abstraction that would add a parallel registration path.

No push is authorized.
