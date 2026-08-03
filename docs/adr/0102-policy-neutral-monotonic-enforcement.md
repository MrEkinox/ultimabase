# ADR-0102: Policy-neutral monotonic enforcement plan

- Status: accepted
- Date: 2026-08-02
- Refines: ADR-0063, ADR-0076, ADR-0089, ADR-0090, ADR-0097, ADR-0101
- Refined by: ADR-0103, ADR-0104, ADR-0113, ADR-0116

## Context

ADR-0090 requires permission plugins to use the native hook lifecycle instead
of reserved CLP, ACL, and field-permission stages. ADR-0101 now executes native
developer and plugin hooks, but Runtime still exposes those three policy names,
installs neutral callbacks for absent plugins, and carries an access-specific
adapter envelope.

Ordinary business hooks may transform an operation or result. Policy effects
cannot use that replacement model safely: a later hook could restore a denied
field, discard a row constraint, or replace authority accumulated by an earlier
plugin. The implementation therefore needs a concrete neutral contract that is
available equally to official permission plugins and community capabilities
such as tenant isolation or soft deletion.

## Decision

### Five neutral contribution categories

Plugins contribute enforcement through the existing owner-scoped hook registry,
never through `runtimePipelineStage`. The registry accepts five policy-neutral
categories:

- `guard` may return successfully or reject the operation. It cannot grant,
  replace, or derive request authority;
- `constraint` contributes opaque adapter constraints and cannot
  replace a previously accumulated node;
- `restrictInput` narrows the fields that mutation input may write;
- `restrictSelection` narrows the fields that a read or mutation may select;
- `restrictOutput` narrows the fields that the final public result may expose.

Each factory accepts an optional exact `schema`, an optional non-empty
`operations` list, and one typed `handler`. Omitting both filters makes the
definition global. Plugins register the protected definition in the shared
owner-scoped hook registry; they do not claim a pipeline stage. Plugin
ownership, dependency order, configuration position, and registration order
are resolved during application setup.

Every callback retains the exact schema and terminal operation type. Input and
selection restrictions return only top-level field names from that exact
schema; output restrictions additionally receive the fully transformed exact
result. A constraint handler returns one node or an array of nodes created by
`databaseConstraint(kind, payload)`; an empty array is valid when that policy
deliberately contributes nothing. Callback inputs expose trusted request
context and immutable operation data, but no mutable authority object or shared
enforcement accumulator. Forged definitions, structural constraint lookalikes,
and invalid return shapes fail closed with deterministic owner and contribution
diagnostics.

### One private monotonic plan per operation

Application assembly compiles the static contribution lookup once. For each
operation, Runtime initially evaluates matching guards, constraints, input
restrictions, and selection restrictions after native input resolution and
validation but before any effectful business before-hook. It reduces the
results into a private immutable plan:

- every guard must allow execution;
- constraints append to one ordered collection that adapters combine with
  logical `AND`;
- input, selection, and output field sets compose by intersection.

The plan is not part of the transformable Operation AST. Business hooks and
other policy contributors cannot read, replace, clear, or reorder another
plugin's private payload. Deterministic contribution order remains useful for
diagnostics, but changing the order of independent contributions cannot broaden
the result.

An input restriction rejects a mutation that still writes an excluded field.
A selection restriction removes excluded fields. Runtime applies both before
business before-hooks. After every business operation transform and structural
revalidation, it reevaluates the same non-output contributions into the
existing state before reapplying the restrictions. Earlier constraints remain;
new value-derived constraints append with logical `AND`, structurally identical
nodes are deduplicated, and field sets intersect again. A transformed operation
therefore cannot rely on a stale guard or replace an earlier decision.

After database execution and every business result transform, Runtime evaluates
each matching output restriction exactly once against the final exact result,
intersects it with the private plan, and applies that intersection immediately
before the result crosses the enforcement boundary. Excluded values are removed
from every applicable singular or collection result. No later transform can
restore them.

The resulting order is:

```text
normalization and structural validation
→ native input resolution and business validation
→ initially accumulate guard, constraint, input, and selection effects
→ apply input and selection restrictions
→ business before-hooks
→ structurally revalidate, reevaluate monotonically, and reapply restrictions
→ database operation with the private constraint collection
→ business after-hooks
→ evaluate and apply final output restrictions once
→ transaction finalization and post-commit delivery
```

### Policy-neutral adapter boundary

`DatabaseAccessConstraintNode` becomes `DatabaseConstraintNode`, and
`DatabaseOperationRequest.accessConstraints` becomes `constraints`. Each node
uses lowercase dot-separated namespace segments. Its payload accepts portable
scalar, array, and plain-object data; `databaseConstraint` detaches and deeply
freezes that payload before accumulation. The meaning remains opaque to
Runtime, which forwards the immutable collection without compiling policy
semantics.

Every adapter request keeps an explicit `constraints` array, including an empty
array when no contribution matched. That envelope prevents adapters from
accidentally losing a computed plan, but it is not a neutral policy handler.
Issue 338 will define the adapter-owned compiler registry and fail-closed
handling for unclaimed kinds and payload versions.

### No permission-specific Runtime surface

The `clp`, `acl`, and `fieldPermissions` discriminants, stage contracts,
exclusive ownership rules, neutral handlers, and assembly branches are removed.
`runtimePipelineStage` remains an infrastructure-level extension point and
cannot register enforcement behavior.

Runtime continues to transport only trusted `anonymous`, `user`, or `master`
authority. It never bypasses a contribution based on that mode. Each policy
callback decides whether `master` changes its own result, without changing the
authority observed by another callback. The former policy-specific Core bypass
table and boundary helper are removed so public foundational names remain
neutral.

An application with no enforcement contribution compiles no enforcement
handler and pays no neutral-callback cost. Existing schema and field extension
ownership validation remains independent: declaring an extension without its
owning plugin still fails setup before infrastructure starts.

## Consequences

- Official ACL, CLP, and field-permission packages can share one mechanism
  without being known by Runtime.
- Community tenancy, moderation, ownership, and soft-delete plugins receive the
  same deny, intersection, and logical-`AND` guarantees.
- Business transforms remain expressive but cannot broaden the private plan.
- Adapters receive neutral constraint names and never receive request authority
  or policy configuration.
- Constraint compilation remains a separate adapter concern implemented by
  issue 338 and its follow-up ADR.
