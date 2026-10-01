# ADR-0285: Sparse generated mutation surfaces derive class methods

- Status: accepted
- Date: 2026-10-01
- Refines: ADR-0279 and ADR-0197
- Approval: user approved the bounded generated-surface cleanup
- Decision issue: [6320](../../issues/6300-source-typed-application-authoring/6320-sparse-generated-mutation-surfaces.md)

## Decision

Keep one canonical generated mutation descriptor per schema alias. Emit only
schema-handle and model method maps; Core derives class methods from the schema
map's keys and those descriptors, using `SchemaClass<SchemaTypeInfoByNameOrBase>`
rather than recursively constructing `SchemaReference`. A model-only alias
never becomes a class method. Runtime and source-projected plugin types do not change.

Omit empty operation interfaces and empty schema-surface entries, including the
whole surface interface when no entry remains. Preserve the complete inert
snapshot and its provenance. Core contract and generator format advance to 21;
snapshot format stays 11. Regenerate application declarations after rebuilding.

## Boundary and evidence

Soft Delete currently contributes real schema/model commands. Named handles,
relation-returned models, and complete Access/Hooks callbacks still need the
retained graph. Their generated maps and descriptors are not removed. No new
descriptor generic, parallel registry, compatibility path, or source-only
relation/callback/Where experiment is authorized by this decision.

A bounded in-memory proof passed source and built Core checks for class methods,
named/concrete handles, bound and related models, and exact negative diagnostics.
The issue must also pass editor regressions, current-production timing checks,
and full validation before completion. Milestone 63's prior architecture stop
remains open; this cleanup is not approval to waive its budgets.
