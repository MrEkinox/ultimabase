# Current plan: Canonical internal boundaries

- Status: in progress
- Milestone: 42
- Baseline: `e0d0b4d1`
- Current issue: 4204

The user authorized another repository-wide debt and DX reduction sequence on
2026-09-26 while retaining every functional capability. This milestone targets
only repeated private validation and lookup boundaries whose contracts are
already identical: capability conflict construction, normalized
update-expression reading, and GraphQL compiled-schema lookup. Each step must
reduce handwritten production code without changing public types, diagnostics,
ordering, naming, or lifecycle ownership.

Issue 4201 centralized four identical capability-conflict constructors with 24
fewer handwritten production lines while preserving exact diagnostics and
provider-planning order.

Issue 4202 made update application and Runtime field traversal share the
canonical normalized-expression reader with 5 fewer handwritten production
lines while preserving their distinct errors and operation semantics.

Issue 4203 made five GraphQL compilers share one compiled-schema lookup with 19
fewer handwritten production lines and no change to generated names, ownership,
or missing-graph diagnostics.

No push is authorized.
