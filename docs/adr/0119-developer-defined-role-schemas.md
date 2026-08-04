# ADR-0119: Developer-defined schema-backed roles

- Status: accepted
- Date: 2026-08-04
- Refines: ADR-0002, ADR-0005, ADR-0006, ADR-0109, ADR-0115, ADR-0116, ADR-0117, ADR-0118

## Context

The original role backlog gave the official roles plugin ownership of one
internal role schema, a separate immutable `Role` value, generic subject
membership storage, and most administration behavior. That would force
applications to accept a fixed role model or grow `rolesPlugin()` options for
custom fields, indexes, permissions, hooks, member types, and transport
exposure.

Core now has constructible schema-model classes, immutable model commands,
native schema and field Access, typed relations, automatic mutation
transactions, and plugin-owned schema extensions. A stored role can reuse
those foundations directly instead of introducing a second persistence API.

## Decision

### Applications define role schemas

`@ultimabase/roles` exports `RoleSchema.define()`. It specializes
`Schema.define()` and requires one exact member schema. The declaration accepts
ordinary custom fields, indexes, Access, hooks, table naming, and compatible
schema options. It injects the reserved role name, member relation, nested-role
self relation, normalized identity storage, and one private extension claimed
by the official roles plugin.

The returned value is the application's role schema-model class. The developer
registers it in `UltimaBase.schemas`, constructs drafts with `new AppRole()`,
persists them through the standard immutable model commands, and may use either
`new Query(AppRole)` or `AppRole.query()` for advanced work. There is no
parallel internal role record, public role repository, or roles-specific CRUD
service.

Reserved role fields cannot be replaced accidentally. Custom fields remain
ordinary fields with their exact inference and native hooks or Access. Stored
role names use one documented locale-independent normalization rule, while the
framework UUID remains the stable identity across rename.

### Role references remain lightweight

`AppRole.role(name)` creates an immutable, schema-qualified name reference.
An explicit object form creates a UUID reference without guessing whether one
string represents a name or identifier. Neither form performs I/O or satisfies
custom role create input. Access and ACL configuration use these references
before the application or database starts. Persisted `AppRole` instances and
UUID references avoid repeated name lookup.

A role reference grants nothing by itself. `hasRole(reference)` is an ordinary
native Access decision supplied by the roles package.

### Membership uses ordinary typed relations

The generated member relation targets exactly the schema supplied to
`RoleSchema.define()`. Persisted role instances add concise `addMember` and
`removeMember` commands whose inputs accept only persisted values or Pointers
from that member schema.

The generated self relation supports `addRole` and `removeRole`. Keeping these
commands separate from member commands makes hierarchy direction, autocomplete,
errors, events, and type inference explicit. `Administrator.addRole(Editor)`
means that direct and inherited members of `Editor` satisfy membership in
`Administrator`.

These commands are immutable model conveniences over Relation and Runtime.
They retain no adapter or application, reuse ambient or explicit terminal
execution, and cannot bypass Access, hooks, automatic transactions, target
preflight, cycle validation, rollback, or post-commit events. Only persisted
role models execute them; `create()` returns a new persisted instance and never
mutates its draft receiver.

### The plugin discovers declarations

`rolesPlugin()` receives no schema, custom fields, indexes, Access, hooks,
member relation, deletion policy, or transport configuration. It discovers
registered RoleSchema extensions by exact class identity, validates each role
domain, provides application-local services and the neutral role resolver,
enforces graph invariants, and memoizes request-local membership resolution.

Each RoleSchema may optionally declare one precisely typed, effect-free
current-member resolver that maps plugin-owned request context to its exact
member Pointer. The roles package does not import an authentication plugin.
Omitting the resolver keeps role CRUD, Query, membership administration, and
hierarchy behavior valid while current-member Access checks deny normally.

Applications may register multiple RoleSchema domains. Schema-qualified role
references, member types, relation graphs, resolver caches, services, and
application ownership keep those domains isolated. Externally managed JWT,
OAuth, or identity-provider roles do not require stored RoleSchema values; a
compatible provider may implement Core's neutral role resolver contract
directly.

### Queries are public but transports are opt-in

Trusted server code may import and query the declared RoleSchema through the
same public API as any application schema. Direct Query and relation mutations
still execute every role invariant contributed by the plugin.

Generated transports hide RoleSchema declarations by default. Explicit REST or
GraphQL exposure belongs to the relevant transport configuration rather than
to `rolesPlugin()` and never changes server-side Query availability.

## Consequences

- Static schemas remain the source of truth for stored roles.
- Custom role data and security reuse ordinary Schema, Query, Access, hook,
  relation, transaction, migration, and adapter behavior.
- `rolesPlugin()` stays option-light and does not recreate native Access.
- A generated AppRole class satisfies the class-based Role API decision without
  adding a second persistable `Role` object.
- Strong member typing comes from the RoleSchema declaration rather than an
  unrelated runtime plugin option.
- ACL and community policies consume neutral schema-qualified references and
  resolver contracts without importing the official roles implementation.
- Role-specific invariants must apply equally to model commands, direct Query,
  and direct Relation paths.
