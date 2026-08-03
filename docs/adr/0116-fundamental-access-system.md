# ADR-0116: Fundamental Access system and policy providers

- Status: accepted
- Date: 2026-08-03
- Refines: ADR-0006, ADR-0089, ADR-0090, ADR-0102, ADR-0113

## Context

Core already owns policy-neutral monotonic enforcement, while permission
plugins are planned to register low-level guards, constraints, and field
restrictions directly in the hook registry. That protects Runtime from concrete
CLP and ACL concepts, but it leaves developer-defined access without one native
schema API and makes every policy plugin rebuild the same operation, row, item,
and field lifecycle.

Access is a fundamental UltimaBase capability even when no permission plugin is
installed. CLP, ACL, field permissions, tenancy, soft deletion, and community
policies are providers for that capability rather than separate execution
systems.

## Decision

### One native Access lifecycle

Core defines four neutral access levels:

- `operation` allows or denies an operation family before effectful business
  hooks;
- `filter` appends a row predicate for reads and mutation targets;
- `item` evaluates create input or one prepared mutation target when the rule
  cannot be represented as a filter;
- `field` controls reading, filtering, ordering, creation, and updating for an
  exact schema field.

Schema operation reads accept one shared decision or complete `one`, `many`,
`count`, and `exists` branches. Field reads accept one shared decision or
complete `item`, `filter`, and `order` branches. The concise form applies to
every branch; the grouped form requires every branch so an indirect disclosure
path never inherits a broader application default accidentally. Mutation
operation families remain direct decisions and retain their exact terminal in
`kind`.

Schemas and fields may declare these rules natively. Applications with no
declaration and no provider follow the configured global default policy. Access
callbacks are precisely typed, may return directly or asynchronously, and
receive only the data appropriate to their level. Runtime awaits them in
deterministic order before effectful business hooks and applies ordinary
cancellation, recursion, and diagnostic protections.

`filter` reuses Core's typed filter AST and normalization. It does not introduce
a second Query engine. Its predicates remain in private Access state, combine
with developer and `beforeFind` predicates through logical `AND`, and cannot be
read, replaced, or removed by business hooks. Unlike `beforeFind`, Access
filters also constrain counts, singular reads, updates, deletes, upserts, and
future relation traversal. One family callback receives `context` and its
schema-aware filter builder but no terminal `kind`; every terminal in that
family must observe the same protected row universe.

### Access compiles to monotonic enforcement

Application setup compiles developer declarations and plugin contributions into
one immutable `AccessPlan` per schema. Runtime executes that plan through the
existing policy-neutral guard, constraint, input, selection, and output
enforcement primitives from ADR-0102.

Operation denial is irreversible, row predicates accumulate with logical
`AND`, and field sets only intersect. Access runs before business hooks; final
field output restrictions run after result transformations so a hook cannot
restore a hidden value.

Item rules never make set-based `updateMany` or `deleteMany` silently load every
matching row. Such a terminal must be protected completely by operation and
filter rules or use an explicit itemized terminal. Create and singular or
itemized mutations may evaluate item rules against their exact input and
prepared target inside the existing transaction.

### Plugins provide policies, not parallel pipelines

Plugins register typed Access contributions through an application-owned
registry. The registry supports global, schema, field, extension, and field-kind
targets and preserves dependency-first deterministic ordering. Every
contribution declares `master: 'bypass'` or `master: 'enforce'`, and target
resolution plus Access-plan compilation finish before infrastructure connects.
A concise application default applies to both operation and field decisions,
while a complete default may distinguish those two levels.

- CLP contributes operation policies.
- ACL contributes row filters, item checks, and ACL-field restrictions.
- field permissions contribute field policies.
- role and authentication plugins provide optional typed context values or
  resolution services consumed by those policies.

Core Access contains no built-in authenticated user, owner, role, CLP, or ACL
rule node. Those concepts belong to their provider packages. Core authority
remains only `anonymous` and `master`; each declaration or provider explicitly
defines its own audited-master behavior.

Permission plugins do not register arbitrary business hooks to enforce access.
The Access compiler lowers their contributions into the same internal monotonic
enforcement plan. The low-level policy-neutral factories remain available for
other Core infrastructure and advanced framework plugins.

### Denial and disclosure semantics

Operation denial produces a typed access error. Row filtering behaves as
non-existence for reads and targeted mutations so inaccessible object existence
is not leaked. Counts and pagination operate on the filtered database set.

A forbidden explicit field selection, filter, order, or mutation input fails
with a typed access error. Fields omitted by a default selection are removed
before output hooks and remain absent from the final model; Core does not invent
transport-specific `null` values.

## Consequences

- Native application access requires no CLP, ACL, role, or authentication
  plugin.
- Permission plugins share one documented lifecycle and cannot weaken one
  another.
- `beforeFind` remains a business Query transform rather than a security
  boundary.
- Database adapters compile accumulated predicates in the same statement as the
  developer query.
- Roles and authenticated principals remain optional capabilities; missing
  providers fail only when a configured policy actually requires them.
