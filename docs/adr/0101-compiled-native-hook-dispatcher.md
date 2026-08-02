# ADR-0101: Compiled native hook dispatcher

- Status: accepted
- Date: 2026-08-02
- Refines: ADR-0015, ADR-0070, ADR-0089, ADR-0090, ADR-0096, ADR-0097, ADR-0099, ADR-0100
- Refined by: ADR-0102

## Context

Schema and field hook declarations are already normalized and stored outside
physical schema metadata. Plugin hook targets are also resolved during setup,
and prepared mutation outcomes now retain complete logical records separately
from selected public results. Runtime still needs one execution model that
combines these boundaries without rebuilding hook discovery for every request.

The dispatcher must also distinguish initial input normalization from later
hook replacements. Replaying the original structural stage would invoke
default factories again, generate new identifiers, advance the application
clock, and append a second generated update timestamp.

## Decision

### Application-scoped compilation

Runtime compiles one immutable native hook plan after plugin setup and before
request execution. Plans are indexed by exact schema and field identity and
retain field paths as segment arrays. They preserve plugin dependency,
configuration, and registration order without introducing priorities.

Pre-operation plugin declarations wrap developer declarations, so plugin
handlers run first. Post-operation phases unwind: developer declarations run
first and plugin declarations run in reverse contribution order. The retained
ADR-0070 low-level hook factories remain outside the native declaration plan
but occupy the same outer before/after positions in the pipeline.

### Input and validation phases

Mutation input processing follows this fixed order:

```text
initial structural validation with defaults, generated values, and one clock
→ field resolveInput, children before parent
→ schema resolveInput
→ pure structural revalidation without generation
→ field validate, children before parent
→ schema validate
→ policy enforcement
→ low-level plugin before hooks
→ native schema business before hooks
→ pure final structural revalidation
```

Field transforms receive only present values and replace them immutably at
their exact segmented path. Schema transforms receive the complete exact
operation. Every replacement preserves the terminal and schema identity.
Validation issues are normalized, path-prefixed, aggregated in deterministic
order, and thrown as one `VALIDATION_ERROR` before database preparation.

The pure revalidation pass reuses the already normalized generated values. It
never calls a default factory, UUID generator, clock, or timestamp projection.

### Prepared mutation phases

After all operation transforms and enforcement have completed, Runtime uses the
transaction adapter selected by ADR-0099 and ADR-0100:

```text
prepare stable target
→ affected-field before hooks, parent before children
→ consume prepared handle exactly once
→ affected-field after hooks, children before parent
→ field onChange for semantic changes
→ native schema business after hooks
→ low-level plugin after hooks
```

`update-one` and `delete-one` with `target: null` skip affected-field hooks.
Set-based `update-many` and `delete-many` never synthesize item values. Upsert
input hooks visit each present create candidate before its update candidate;
only the materialized outcome identifies the database-selected branch.

Field hooks always consume complete target or materialization snapshots. Public
selection remains isolated in `outcome.result`, and transformed results are
validated against their exact terminal and selected fields before becoming
observable.

### Deferred lifecycle phases

Issue 330 executes mutation input, validation, before, after, and `onChange`
phases. Read-specific `beforeFind`, `afterFind`, and `resolveOutput` remain issue 331. Transaction finalization remains issue 332, recursion and failure
diagnostics remain issue 333, and the public `HookContext` capability remains
issue 340.

## Consequences

- Hook discovery and target expansion never repeat per request.
- Defaults, generated identifiers, and timestamps execute once even when hooks
  transform input.
- Field order is deterministic for nested objects, listed objects, and literal
  field names containing dots.
- Selected result typing is unaffected by the complete private records required
  by field hooks.
- Policy plugins can later replace named stages with monotonic effects without
  changing the native business dispatcher.
