# ADR-0089: Native schema and field hook lifecycle

- Status: accepted
- Date: 2026-08-01
- Refines: ADR-0015, ADR-0068, ADR-0069, ADR-0070, ADR-0076, ADR-0088
- Refined by: ADR-0090, ADR-0093, ADR-0095, ADR-0096, ADR-0097, ADR-0099, ADR-0100, ADR-0101, ADR-0102, ADR-0104, ADR-0105, ADR-0111

ADR-0090 replaces the permission-specific named stages and ordering references
in this record with policy-neutral monotonic hook effects. The remaining native
schema, field, transaction, bulk, and lifecycle decisions stay accepted.
ADR-0095 consolidates the foundational packages, and ADR-0096 fixes the native
declaration, inference, and identity-owned storage boundary.

## Context

ADR-0070 established typed plugin-owned before/after operation contributions
and post-commit events. That low-level mechanism proves deterministic ordering
and transaction-aware delivery, but it does not yet provide the Parse- or
Keystone-inspired developer experience expected from UltimaBase. Developers
must be able to colocate business behavior with a schema or field, reuse one
handler across operation families, and rely on automatic rollback when a hook
performs additional database work.

Hooks are a fundamental Runtime capability. They are not an optional plugin,
schema extension, access rule, transport callback, or migration mechanism.
Plugins may contribute hooks through the same application-owned dispatcher,
but no plugin is required to activate hooks declared by an application.

## Decision

### Native declaration scopes

UltimaBase exposes immutable native hook declarations at two developer-owned
scopes:

- schema hooks receive the exact inferred create input, update input, persisted
  object, query, operation, and result shapes relevant to their phase;
- inline field hooks receive the exact logical field value, including enum
  literals, objects, list dimensions, and nullability.

Inline field hooks intentionally do not pretend to know the complete sibling
field map while their field factory is still being evaluated. Cross-field
business rules belong to schema hooks, where the complete schema is available.
Hook callback literals and runtime configuration do not affect field value
inference and must not expand compact field factory hovers.

The target developer syntax keeps hooks with their declaration:

```ts
const UserSchema = new Schema({
	className: 'User',
	fields: {
		email: stringField({
			hooks: {
				resolveInput: ({ value }) => value.trim().toLowerCase(),
			},
		}),
	},
	hooks: {
		beforeSave: ({ operation }) => {
			// One handler covers create, update, and upsert families.
		},
	},
})
```

The implementation must preserve the package dependency direction. The first
implementation issue must prove a dependency-safe declaration boundary with
source and packed-package TypeScript language-service fixtures. It may propose
a follow-up ADR for package placement, but it may not weaken direct
autocomplete, inline field typing, or schema-wide inference merely to avoid
that design work.

### Hook phases and operation families

Native hooks include:

- `resolveInput` for immutable create, update, and upsert transformations;
- `validate` for structured business validation issues;
- `beforeCreate`/`afterCreate`, `beforeUpdate`/`afterUpdate`,
  `beforeUpsert`/`afterUpsert`, and `beforeDelete`/`afterDelete`;
- `beforeSave`/`afterSave` across create, update, and upsert;
- `beforeFind`/`afterFind` across `find`, `first`, `get`, `count`, and
  `exists`;
- `beforeOperation`/`afterOperation` across every terminal operation;
- post-commit, error, and transaction lifecycle phases described below;
- field `resolveOutput` for same-type output transformation after field access
  has been enforced;
- field `onChange` contributions that run only after a persisted value has
  semantically changed.

Schema hooks may use every operation and transaction phase. Field hooks use
`resolveInput`, `validate`, compatible CRUD/save before and after phases,
`resolveOutput`, `onChange`, `afterCommit`, `afterRollback`, and `onError` when
that field participated in the operation. Set-based update and delete are the
deliberate exception: they run operation and schema hooks but never fabricate
per-field values by loading rows.

A phase accepts one handler when the same behavior applies everywhere or a
family map when behavior differs. `create`, `update`, `upsert`, `delete`,
`save`, and `find` families cover their singular and bulk terminal variants.
The hook input retains the exact terminal `kind` as a discriminant when a
handler needs to distinguish those variants. Developers are never required to
repeat one function for `createOne` and `createMany`.

One declaration may contain one handler or an ordered handler list. Input and
output transformations feed each result into the next handler. Validation
issues are aggregated. Effect handlers run sequentially. Arbitrary numeric
priorities are not introduced.

Overlapping phases nest from broad to specific before persistence and unwind
from specific to broad afterward. A save mutation therefore uses
`beforeOperation`, `beforeSave`, then its exact CRUD phase; after persistence it
uses the exact CRUD phase, `afterSave`, then `afterOperation`. Reads use
`beforeOperation` then `beforeFind`, followed by `afterFind` then
`afterOperation`. Issue 327 selected `{ all, create, update, upsert, delete,
find }` family maps for combining shared and compatible family-specific
handlers without changing this order. Each branch also accepts a non-empty
ordered list; a family retains singular and bulk terminals through its exact
`kind` discriminant rather than duplicating `one` and `many` branches.

Transforms return new values. Runtime never relies on mutation to detect hook
intent. Validation returns immutable structured issues rather than mutating an
error collector. A field output resolver must preserve its logical value type;
a plugin requiring a different public value type must define a custom field.

### Plugin contributions

Every plugin setup context may add hooks without replacing developer hooks.
The fundamental hook registry supports:

- global targets;
- exact schema identity targets;
- exact typed field paths within one schema;
- schema-extension targets;
- field-extension targets;
- namespaced field-kind targets.

Nested field paths use typed path segments rather than unvalidated dot-string
parsing. Each contribution records its plugin owner and a plugin-local stable
name. Duplicate identities from the same owner fail. Missing schemas, invalid
paths, incompatible definitions, and late registration fail during application
initialization. Registry snapshots remain isolated per application.

Plugin contributions use dependency order, then configuration position, then
registration order. ADR-0097 specifies the owner-scoped target facade,
initialization factories, and plugin-local identities. Pre-operation plugin
contributions wrap developer hooks; post-operation contributions unwind around
them. Permission plugins contribute monotonic enforcement hooks through the
same dispatcher and do not create permission-specific Runtime stages.

### Automatic mutation transactions

Every root mutation runs inside an adapter transaction, including singular,
set-based bulk, and upsert operations. Validation and access may reject an
operation before business behavior, but once business hooks can execute they
receive the transaction-bound `RequestEngine`. `getCurrentEngine()` and an
engine elevated through `useMasterKey()` retain that transaction lifetime.

Database operations started by before- or after-hooks through the supplied
engine commit or roll back with the primary mutation. Any operation or hook
failure makes the transaction rollback-only even when user code later catches
the rejection. Business after-hooks still run before commit and may abort.

The transaction portion of ADR-0069 is refined: `{ atomic: false }` may change
how a bulk collection is grouped, but it must never separate one item's hooks
from that item's persistence. No mutation executes without an atomic boundary.
ADR-0111 defines the partial-result and stopping policy: adapters stop at the
first persistence failure, result hooks receive the successful-prefix wrapper,
and the prefix commits only after every remaining pre-commit hook succeeds.

Reads do not open an automatic transaction. `beforeFind` and `afterFind` are
expected to transform or observe reads without hidden writes. A developer may
use `RequestEngine.transaction()` when a read must share an atomic workflow.

External systems cannot participate in the database rollback. Email, remote
APIs, files, queues, realtime delivery, and asynchronous audit delivery belong
after commit or in a transactional outbox.

### Transaction and failure lifecycle

Schema and field `afterCommit` handlers are buffered per completed operation
and run only after the successful outer commit. `beforeCommit` runs once for an
outer transaction and may still abort it. `afterRollback` runs only after the
adapter confirms rollback. `onError` may observe failures that occur before a
transaction begins as well as failures that cause rollback. Post-finalization
handler failures never replace the original business error or claim that a
committed write was rolled back.

### Bulk semantics

Create-many and upsert-many run value-producing field and item hooks in stable
input order. One operation-level hook wraps the complete batch. Set-based
`updateMany` and `deleteMany` remain set-based and do not silently load every
matching object merely to emulate per-object hooks. A future explicit
`updateEach` or `deleteEach` terminal may opt into that cost.

### Safety and observability

Every hook input is immutable and carries the relevant operation kind,
request, transaction identity, abort signal, and transaction-bound engine.
Runtime records a hook execution stack. Dangerous same-hook recursion fails
with a typed framework error unless a future explicit bounded reentrancy
contract permits it. A general `skipHooks` flag is forbidden because it would
silently bypass business invariants.

Hook identities and phase timing are observable without exposing secrets or
raw master credentials. Timeouts and request cancellation use `AbortSignal`.
Hooks are sequential by default; Runtime does not create implicit races between
field or schema business callbacks.

### Order

The detailed dispatcher is implemented in focused phases, but it preserves
this semantic order:

```text
normalization and structural boundary
→ CLP
→ ACL / object filtering
→ field permissions
→ field resolveInput
→ schema resolveInput
→ structural revalidation
→ field validate
→ schema validate
→ plugin/global before hooks
→ schema before hooks
→ affected field before hooks
→ database operation
→ affected field after hooks
→ schema after hooks
→ plugin/global after hooks
→ beforeCommit
→ commit
→ afterCommit
```

Access constraints remain separate from the developer-transformable query, so
`beforeFind` cannot remove ACL filters or restore forbidden selected fields.

## Consequences

- The existing ADR-0070 factories remain the low-level plugin foundation while
  native declarations become the normal application DX.
- Schema and field hooks gain compact, documented IntelliSense and dedicated
  compile-time regression tests.
- Automatic mutation transactions trade some adapter round trips for a simple
  no-orphan-write guarantee across business hooks.
- True set-based writes retain their performance contract instead of hiding
  per-row materialization.
- Hook changes do not create database migrations or enter physical schema
  diffs.
- The implementation requires coordinated Schema, Core, Query, Runtime, and
  PostgreSQL E2E work and is therefore split into ordered issues 324–335.
