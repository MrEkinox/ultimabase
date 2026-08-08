# ADR-0169: Operation-oriented Access declarations

- Status: accepted
- Date: 2026-08-08
- Refines: ADR-0116, ADR-0167, ADR-0168

## Context

The native Access lifecycle is internally organized into operation decisions,
row restrictions, item decisions, and field decisions. Its public schema
declaration copied those internal stages as separate `operation`, `filter`, and
`item` objects. Understanding one update or delete policy therefore required
reading the same operation name in several distant branches.

The vocabulary also became ambiguous. Schema `filter` named a private row
policy while field `filter` named permission to use a field in predicates, and
`item` named both a materialized mutation decision and a field-output channel.
Callback discriminants repeated information already supplied by their named
declaration branch.

## Decision

Schema Access declarations are organized by the public operation families
`read`, `create`, `update`, `upsert`, and `delete`. Each family accepts one
direct boolean or callback as its concise operation decision. A detailed family
object groups the applicable stages:

- `allow` makes the early operation decision;
- `where` contributes a private database row restriction;
- `item` evaluates the prepared draft, candidate, or persisted target.

Read `allow` retains its shared decision and complete `one`, `many`, `count`,
and `exists` forms. Create has no `where`; read has no item decision. Omitted
stages contribute no rule and continue to use the application fallback where a
decision is required.

`where` uses `WhereInput` as its direct static representation. A dynamic
callback receives the effect-free context and schema-aware immutable builder,
then returns `WhereInput`, `WhereBuilder`, or `undefined`. `undefined` means no
additional restriction from that contribution. Booleans are not row-policy
values: complete denial belongs to `allow: false`.

Inline field Access remains colocated with each field. Its grouped read form is
`{ output, filter, order }`; `output` replaces the overloaded `item` name.
Only direct booleans may apply one decision to every read channel. Each callback
belongs to one named channel and receives only the data available there. Field
create and update callbacks similarly omit internal operation terminals.

Schema item callbacks omit `kind` because their containing operation branch is
the discriminant. Create receives `item`; update receives `originalItem` and
`item`; delete receives only `originalItem`; and upsert retains `mode` because
the database-selected create or update materialization changes its input shape.

These changes affect authoring and normalization only. The application compiler
continues lowering declarations into the same private monotonic operation,
row-filter, item, and field plan. Runtime order, recursive relationship policy,
master behavior, denial semantics, and adapter contracts do not change.

## Consequences

- The complete schema policy for an operation is readable in one branch.
- Public names describe developer intent without exposing the internal plan
  layout or terminal cardinality.
- Static row policies no longer require a callback, and dynamic policies retain
  the immutable builder utility.
- Field output no longer collides with schema item authorization.
- Removing shared field-read callbacks trades a small shorthand for precise,
  channel-specific autocomplete and callback inputs.
- This pre-release change intentionally rejects the previous declaration shape;
  applications and official plugins migrate together.
