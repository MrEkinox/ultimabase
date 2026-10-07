# ADR-0212: Field-owned portable plugin containment

- Status: accepted
- Date: 2026-08-21
- Refines: ADR-0053, ADR-0102, ADR-0124, ADR-0126, ADR-0136, ADR-0192, ADR-0205
- Depends on: ADR-0124, ADR-0136, ADR-0192, ADR-0205
- Supersedes after migration: ADR-0125

## Context

ADR-0124 lets a plugin-defined scalar own a portable JSON storage codec without
teaching Core or a database adapter about that field kind. ADR-0192 deliberately
grants such a field only complete-value equality and membership. A storage codec
alone does not prove that ordering, string matching, structural containment, or
another query operation is meaningful for the logical value.

Persisted ACL currently needs two narrower structural searches over its JSON
representation:

- request authorization asks whether a row grants every required permission to
  public, authenticated, exact-principal, or resolved-role subjects; and
- subject-reference discovery asks whether an ACL contains one exact principal
  or role before provider-owned `fail`, `preserve`, or `cascade` deletion.

`@ultimabase/acl-postgres-plugin` currently translates dedicated opaque
constraints for both searches into PostgreSQL JSONB containment. The bridge
preserves package direction, but it makes applications install a second ACL
plugin for behavior that the ordinary portable Query AST already represents for
Core JSON and object fields. Community JSON-backed field plugins have the same
gap and would otherwise need one integration package per adapter.

The replacement must not infer structural semantics from JSON storage, expose
raw SQL or complete private storage documents, introduce a custom operator
registry, or let a protected policy bypass Core's monotonic enforcement.

## Decision

### One explicit field-owned capability

`definePluginField()` gains one optional `structuralContains` declaration for a
non-list plugin scalar. The declaration is valid only when that exact field also
owns ADR-0124's portable `json` storage codec. It supplies one pure synchronous
`snapshotOperand(value, path)` function and retains its exact operand type for
source inference and Typegen.

The declaration opts into only the existing structural `contains` operator. It
does not imply `containedBy`, key lookup, path traversal, JSONPath, ordering,
string matching, or a plugin-defined operator. A JSON codec without this
declaration continues to receive only complete-value equality and membership.
List fields remain outside version 1 because their established element and
complete-list predicates already have different semantics.

The public shape is conceptually:

```ts
definePluginField(kind, options, {
	snapshotValue,
	storageCodec: {
		format: 'json',
		version: 1,
		encode: encodeCompleteValue,
		decode: decodeCompleteValue,
	},
	structuralContains: {
		snapshotOperand: snapshotContainmentFragment,
	},
})
```

The Core-owned containment protocol has version 1. Plugin authors do not choose
or overload that protocol version; the plugin-owned storage codec keeps its own
independent physical version. Compiled metadata and adapters compare the exact
Core protocol version instead of treating future versions as compatible.

### Three representations stay separate

The field contract distinguishes three values:

1. the logical scalar used by models and complete-value equality;
2. the complete JSON storage value returned by `storageCodec.encode()` and
   accepted by `storageCodec.decode()`; and
3. the partial JSON containment operand returned by
   `structuralContains.snapshotOperand()`.

Core never passes a containment operand through `snapshotValue()`,
`storageCodec.encode()`, or `storageCodec.decode()`. The field owner is
responsible for mapping its public containment input directly to the partial
encoded fragment whose meaning follows ADR-0136's portable structural
containment semantics.

Core invokes `snapshotOperand()` while normalizing an untrusted where input,
then independently verifies that the result is portable JSON, recursively
detaches it, and deeply freezes it. Functions, symbols, accessors, class
instances, cycles, `undefined`, non-finite numbers, and other non-JSON values
fail before a Query AST is published. Mutating either the caller's input or a
plugin-owned temporary after normalization cannot change the leaf.

The executable snapshot function remains a private field-factory capability.
The public schema compiler IR, Typegen snapshot, packed declarations, Query AST,
and database request carry only inert protocol metadata, the owner-scoped type
reference where required, and the detached JSON operand. Adapters never receive
or invoke the plugin callback.

### Ordinary Query and protected policy use the same leaf

An opted-in field exposes the exact operand through the existing public forms:

```ts
Post.findMany({ where: { custom: { contains: fragment } } })
where.contains('custom', fragment)
```

The object input and `WhereBuilder` normalize to the existing
`{ kind: "contains", field, value }` Query leaf. Typegen records the capability
and the field owner's named operand type as inert metadata; it emits neither the
snapshot callback nor executable client code. JavaScript follows the same
Runtime validation without generated files.

Protected policies return that same validated leaf in `rowFilter`. They may
reference policy-private fields as already accepted by ADR-0167 and ADR-0205,
but they do not receive a second containment API or a pre-encoded adapter
constraint. Core resolves the leaf against the exact application-owned schema,
checks the field capability, and combines every independent policy row filter
with logical `AND`. A policy can build `OR` branches inside its own predicate,
but cannot inspect, replace, or broaden another contribution's accumulated
state. Public field-filter authorization still applies to developer queries;
the private policy path does not grant that authorization to callers.

### Adapters explicitly advertise and compile the portable protocol

Database adapters advertise exact support for Core's plugin-field structural
containment protocol alongside their other versioned
`DatabaseAdapterCapabilities`. Portable JSON storage support alone does not
imply query support. Runtime detects an opted-in plugin-field containment leaf
in either the developer predicate or a protected row filter and fails before
calling an adapter whose support marker is missing, malformed, or stale.

A capable adapter receives the ordinary Query AST, the resolved field, and only
the inert containment metadata. It compiles the already-snapshotted partial JSON
operand according to ADR-0136. PostgreSQL lowers it to parameterized JSONB `@>`;
it does not import the field plugin, call the storage codec for that operand,
inspect policy state, interpolate JSON into SQL text, or add an ACL-specific
branch. Existing JSON/object containment and plugin complete-value equality
remain unchanged.

### ACL migration is atomic and fail-closed

ACL authorization will create one logical `OR` per required permission. Its
alternatives contain the existing persisted fragments for public,
authenticated, exact principal, and each resolved role. Independent required
permissions remain combined by Core through logical `AND`. Missing identity or
role resolution preserves the current fail-closed behavior by omitting only the
unavailable alternatives; it never creates a grant.

Reference discovery will use exact partial principal or role entries through
the same field capability inside its existing private, transaction-bound
maintenance scope. Lock-aware singular cleanup, current-value derivation,
rollback, unrelated-grant preservation, and provider-owned deletion policy do
not change.

ADR-0125 remains the operative compatibility implementation until both the ACL
authorization and reference-discovery constraint families have migrated. Issue
1804 moves both families, removes their public opaque contracts, deletes
`@ultimabase/acl-postgres-plugin`, and marks ADR-0125 superseded in one commit.
There is no partial migration, silent fallback, parallel legacy API, or empty
bridge package. Until that atomic boundary, a missing ACL/PostgreSQL bridge
continues to fail closed exactly as it does today.

## Required regression matrix

Later implementation issues must protect all of the following:

- Core Runtime rejects containment without a JSON codec, list-field opt-ins,
  malformed declarations, unsupported fields, non-JSON snapshot results,
  mutable aliases, forged leaves, and missing or stale adapter support;
- source and compiled-package type tests give opted-in fields their exact
  `contains` operand and give ordinary portable plugin fields no structural
  operator;
- language-service tests protect completion and hover documentation for
  `definePluginField`, object where inputs, and `WhereBuilder`;
- Typegen and packed snapshots retain only the protocol marker and owner-scoped
  type reference, regenerate deterministically, and contain no callback;
- a generic test adapter proves developer and protected-policy leaves use the
  same AST, private row filters compose by `AND`, and application instances do
  not share field capabilities;
- PostgreSQL compiler and Testcontainers tests prove parameterized JSONB `@>`,
  nested `AND` and `OR`, GIN-compatible execution, codec/operand separation, and
  one unrelated community field with no adapter bridge;
- ACL tests preserve public, authenticated, principal, role, Master, relation,
  mutation-target, cleanup, rollback, and application-isolation semantics with
  only `aclPlugin()` and `postgresPlugin()`; and
- package archives, public exports, manifests, aliases, dependency constraints,
  active examples, and documentation contain no ACL bridge after issue 1804.

## Consequences

- Applications ultimately install one ACL plugin while ACL and PostgreSQL stay
  independent packages.
- Community JSON-backed scalar plugins can expose typed structural containment
  without SQL, Drizzle, adapter callbacks, or one bridge package per database.
- Core learns only a versioned field capability and continues to own immutable
  Query normalization and monotonic protected state.
- Adapters remain policy-neutral and opt into a portable query protocol
  independently from JSON storage.
- Plugin authors must deliberately define the safe partial operand surface; a
  codec never makes a private physical document queryable by accident.

## Non-goals

- A custom Query operator or adapter compiler registry for field plugins.
- `containedBy`, key, path, JSONPath, ordering, range, or string semantics for
  arbitrary plugin fields.
- Exposing a complete storage codec, raw stored document, SQL, or Drizzle to
  application Query authors.
- Changing ACL permissions, persisted JSON, role resolution, cleanup policy,
  transaction semantics, or Master authority.
- Renaming `@ultimabase/acl-permissions-plugin` or `aclPlugin()`.
