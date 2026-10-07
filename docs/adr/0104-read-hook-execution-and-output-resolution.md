# ADR-0104: Read hook execution and safe output resolution

- Status: superseded by ADR-0161 and ADR-0163
- Date: 2026-08-02
- Refines: ADR-0058, ADR-0067, ADR-0074, ADR-0089, ADR-0101, ADR-0102, ADR-0103
- Refined by: ADR-0141, ADR-0142

ADR-0161 removes field `resolveOutput`, and ADR-0163 removes native schema read
hooks. Reads now use Query options for developer shaping and Access for
mandatory restrictions; this record is retained only as history.

## Context

Native `beforeFind`, `afterFind`, and field `resolveOutput` declarations already
retain exact schema, terminal, selection, and logical-value types. Runtime must
now execute them without allowing a business transform to change the public
result shape or weaken a private policy contribution.

Read execution crosses several boundaries with different responsibilities. A
developer `Query` describes portable filters and projection, policy plugins may
append opaque database constraints, an adapter may return untrusted values, and
output hooks may transform only values the caller is allowed to observe. Mixing
those responsibilities would let a query hook remove a constraint, expose an
unselected value to a resolver, or restore a field after a monotonic output
restriction removed it.

The existing low-level schema and global after-hook stages also predate native
result validation. Their replacements must cross the same final exact-result
boundary before Runtime returns them.

## Decision

### One selection-preserving read lifecycle

Every `find`, `first`, `get`, `count`, and `exists` operation executes the
schema `beforeOperation` phase followed by `beforeFind`. One `beforeFind`
declaration therefore covers the complete read family while its `kind`
discriminant preserves terminal-specific narrowing.

A `beforeFind` handler returns a new immutable `Query` or `undefined` to retain
the current query. Runtime rebuilds the same terminal operation around that
query and rejects a replacement that changes the exact schema identity or
selected-field union. The handler may add filters, ordering, pagination, or a
limit, but it cannot change the result projection. The original `Query` remains
unchanged.

After database execution, object-producing reads execute field `resolveOutput`
and then schema `afterFind`; the broader `afterOperation` phase unwinds last.
`count` and `exists` skip field resolution because they contain no selected
object values, while `afterFind` still receives an exact `number` or `boolean`
result.

### Constraints remain outside Query

Opaque adapter constraints stay in Runtime's private monotonic enforcement
state and in the separate database request envelope. They never become Query
filters and are not supplied to `beforeFind`. Runtime passes the transformed
Query and the accumulated constraint collection to the adapter independently,
so a business hook cannot inspect, replace, reorder, or remove a policy
constraint.

After a query transform, Runtime reevaluates matching enforcement contributions
and reapplies the accumulated selection intersection. Adapter-specific
constraint compilers continue to combine every constraint with the ordinary
Query predicate using logical `AND`.

### Projection precedes output transformation

Runtime validates an adapter result against the exact terminal and projects
object records to the effective selected fields before any output hook receives
a value. Field `resolveOutput` therefore runs only for present, selected,
readable fields. It never receives an omitted value and cannot synthesize an
unselected sibling field.

Structured field resolution visits selected nested children before their
parent. Each handler may return a replacement of the field's same logical type
or `undefined` to retain the current value. Every replacement is snapshotted so
hooks cannot mutate a retained adapter result or an earlier hook input.

Schema `afterFind` receives the already projected and field-resolved result. It
may observe or replace only the exact result type correlated with the terminal
and selected-field union. Native result replacements are validated as they
cross their phase boundary.

The retained low-level `schemaAfterHooks` and `globalAfterHooks` stages continue
to wrap native schema result phases for compatibility. Their completed result
chain now crosses the same exact terminal-and-selection validation boundary;
an invalid legacy replacement fails before any value becomes public.

### Final restrictions are the last output boundary

Monotonic `restrictOutput` contributions are evaluated only after field
resolution, native `afterFind` and `afterOperation`, and the low-level after-hook
chain have completed. Runtime intersects every matching restriction and applies
the resulting projection immediately before returning the value. No later
business transform can restore a removed field.

The resulting read order is:

```text
normalization and structural validation
→ native input and validation phases
→ initially accumulate constraints and selection restrictions
→ low-level before hooks
→ schema beforeOperation then beforeFind
→ revalidate the transformed operation and reapply monotonic enforcement
→ database read with Query and constraints kept separate
→ exact selection projection
→ selected field resolveOutput, children before parent
→ schema afterFind then afterOperation
→ low-level schema and global after hooks
→ final exact-result validation
→ final monotonic output restriction
→ post-operation delivery
```

### Reads do not create transactions

A root read does not begin an automatic transaction. Its hooks use the current
request engine and must not assume that database work performed by a read hook
will roll back with the read. When a read participates in an explicit
`RequestEngine.transaction()` callback, it preserves and reuses that existing
transaction-bound engine without opening a nested transaction.

## Consequences

- One read hook declaration serves direct Query, REST, GraphQL, and future
  transports through the shared Runtime path.
- Selection inference remains honest because `beforeFind` cannot widen or
  narrow the selected-field union.
- Field resolvers never observe values excluded by selection, and final policy
  restrictions cannot be undone by later transforms.
- Database adapters receive ordinary Query clauses and opaque constraints as
  separate inputs with no hook-owned escape hatch.
- Legacy result hooks remain usable but no longer bypass terminal-specific
  result validation.
- Read hooks remain lightweight by default because Runtime creates no hidden
  transaction for them.
