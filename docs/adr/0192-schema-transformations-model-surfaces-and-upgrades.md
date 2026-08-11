# ADR-0192: Schema transformations, model surfaces, and plugin upgrades

- Status: accepted
- Date: 2026-08-11
- Refines: ADR-0109, ADR-0115, ADR-0173, ADR-0187, ADR-0190, ADR-0191
- Depends on: ADR-0187, ADR-0190, ADR-0191

## Context

ADR-0187 accepts plugin-owned schemas, patches, model methods, and operations,
but does not define selector visibility, the complete patch vocabulary, or how
application-specific methods can coexist with frozen reusable schema classes.
Persisted provenance also needs an upgrade rule rather than only a promise not
to drop data when a plugin disappears.

## Decision

### Deterministic selector and patch stages

Developer and Core declarations form the initial immutable graph. Plugins then
run in resolved dependency order. A plugin's selectors evaluate once against
the complete graph produced by earlier plugins, before any patch from the
current plugin is applied. All selected targets are frozen, then that plugin's
patches apply in registration order. A plugin cannot make its later selector
match a field it just added accidentally.

The application owns developer declarations under a reserved non-forgeable
owner identity. Cross-owner patches name both the target owner and expected
target identity. Stale ownership or shape expectations fail rather than
retargeting a similarly named field.

`schema:declare` may add owned schemas, fields, indexes, option values, and
generated surfaces. `schema:transform` may add, replace, rename, or remove:

- ordinary fields and relationship declarations;
- schema and field option values;
- indexes and portable constraints;
- extensions, generated identities, and public handles;
- plugin-owned validation and physical metadata.

Schema class names and Core identity fields are stable identities, not ordinary
patches. A transform cannot remove or rename `id`, forge schema ownership,
change the identifier protocol, introduce an unsupported relationship target,
or invalidate the minimum portable schema contract. Replacing those mechanisms
requires `schema:replace` and a compatible replacement of the complete
versioned schema compiler capability; even that replacement must satisfy Core's
application ownership and operation identity protocols.

Renaming a schema is represented as a new schema plus explicit migration
metadata. It is never inferred from deleting one name and adding another.

### Plugin-owned option namespaces

One option namespace contribution supplies its JavaScript validator,
normalizer, immutable snapshot representation, Typegen descriptor, owning
capability requirement, and optional Runtime compiler. Unknown, unowned, or
malformed options fail during static compilation. Installing a plugin does not
silently inject option values into every schema; a separate declared patch must
target them.

### Application-local model surfaces

Stable package-owned schema classes may expose methods defined by that package
at module declaration time. Application-conditional plugin surfaces never
mutate a frozen exported class or its prototype.

`ultimabase.schema(nameOrClass)` returns one application-owned
`ApplicationSchemaHandle`. Plugin-added schema commands, query extensions,
custom operations, and static-like methods live on that handle. Instance-like
commands live on an immutable model handle obtained from the schema handle for
one exact draft or persisted model. Both handles preserve the original schema
and model identity and delegate execution through the current RequestEngine.

Typegen gives literal schema handles and model handles their exact methods.
JavaScript uses the same handles dynamically with runtime validation. No
generated executable client, global prototype mutation, adapter reference, or
dirty tracking is introduced.

### Upgrade and removal provenance

Snapshots record plugin ID, instance ID, package version, capability protocol
version, stable contribution ID, and normalized static options for every
persisted contribution.

A plugin version may declare explicit upgrade steps from compatible prior
version ranges with `migration:contribute`. Upgrade steps contribute logical
migration intent; the selected database migration plugin compiles and applies
physical work. Missing required upgrade support fails schema preparation under
migration ownership instead of falling back to destructive synchronization.

Removing a plugin makes its previous contributions orphaned provenance. The
logical application may omit them, but storage remains until an explicit
reviewed migration preserves, maps, archives, or drops it. Rename inference and
automatic destructive cleanup remain forbidden.

## Consequences

- Schema transformations have deterministic target visibility and cannot drift
  with incidental registration order.
- Application-specific DX uses typed Runtime handles instead of mutating shared
  schema classes.
- Plugin upgrades and removals remain inspectable and migration-owned.
- Core invariants survive ordinary transforms while an exceptional complete
  schema-compiler replacement remains possible.

## Non-goals

- Mutable Active Record models or generated Runtime delegates.
- Automatically deciding whether two database columns represent a rename.
- Executing physical migrations inside Core.
