# ADR-0122: Immutable persisted object ACLs

- Status: accepted
- Date: 2026-08-04
- Refines: ADR-0005, ADR-0006, ADR-0113, ADR-0116, ADR-0117, ADR-0119
- Superseded in part by: ADR-0123 for ACL rights and ACL-field management

## Context

Native Access already owns UltimaBase's operation, row-filter, item, and field
authorization lifecycle. Object ACL must add persisted per-row grants without
creating another permission pipeline, teaching Core about users or roles, or
forcing applications to install authentication.

ACL values also cross several boundaries: developer configuration, create and
update input, database storage, transport serialization, role cleanup, and
audit events. Their public class API and serialized representation therefore
need one stable contract before adapter work begins.

## Decision

### ACL is an immutable value class

`@ultimabase/acl-permissions-plugin` exports `ACL`. One ACL grants `read`,
`update`, `delete`, and `manageAcl` to any number of public, authenticated,
exact-principal, and role subjects.

The public API uses symmetric immutable methods:

```ts
const acl = new ACL()
	.grantPublic('read')
	.grantPrincipal(User.pointer(aliceId), 'read', 'update')
	.grantPrincipal(User.pointer(bobId), 'read')
	.grantRole(Editor, 'read', 'update')

const nextAcl = acl
	.revokePrincipal(User.pointer(aliceId), 'read')
	.setRolePermissions(Editor, 'read')
```

`grant*` unions rights, `revoke*` removes only the supplied rights, and `set*`
replaces one subject's complete right set. Removing the final right removes the
subject entry. Repeating any operation is deterministic and idempotent. Every
method returns a new frozen ACL and never mutates an earlier branch.

Targeted inspection uses `permissionsForPublic()`,
`permissionsForAuthenticated()`, `permissionsForPrincipal()`,
`permissionsForRole()`, and matching `has*Permission()` methods. Constructing,
modifying, or inspecting an ACL performs no persistence or subject resolution.

There is no master subject or `grantMaster()`. Master is trusted execution
authority rather than stored ACL data.

### Subjects retain stable provider-neutral identity

An exact principal is identified by its schema class name plus object ID. The
developer supplies a Core `Pointer<TSchema>`, so two schemas may use the same ID
without colliding and one ACL may contain principals from several schemas.

Roles use neutral schema-qualified role references. `grantRole()` accepts such
a reference or a persisted role model exposing the same neutral capability, so
the concise `grantRole(Editor, ...)` form does not create a package dependency.
The ACL package never imports the official roles package, while the roles
resolver understands the stable reference emitted by its own RoleSchema domain.
Name references may be used before persistence, but database storage resolves
them to the role's stable UUID.

Core exposes one optional application-local current-principal resolver service.
An authentication plugin may provide a principal Pointer through that neutral
contract. Its absence is valid: public and master behavior continue to work,
while authenticated and exact-principal grants fail closed. Role grants consume
Core's separate neutral role resolver and never require a concrete roles plugin
identity.

### JSON is versioned and strictly validated

`acl.toJSON()` returns one detached immutable `ACLJSON` document containing a
format version, public rights, authenticated rights, principal entries, and role
entries. `JSON.stringify(acl)` therefore uses the same public representation.

`ACL.fromJSON(value: unknown)` validates the complete untrusted boundary,
rejects unknown versions, subjects, permissions, and malformed identities, and
returns a canonical immutable ACL. Canonical ordering and duplicate
normalization make equivalent ACLs serialize identically. Repeated rights and
repeated entries are combined by union before one canonical entry is emitted.
JSON conversion never queries a provider or database.

The JSON representation is a public transport and snapshot format. PostgreSQL
stores one adapter-owned JSONB representation on the protected object row and
adds a GIN index for subject-and-right containment. This avoids an ACL join on
every protected query, keeps object and ACL writes atomic, and does not require
one generated ACL table per schema. Another adapter may choose a different
physical representation without changing the class contract.

### Schema configuration owns row-specific behavior

The package exports an `acl()` schema extension. It injects one reserved ACL
field and supports:

- a static ACL default or an asynchronous default factory;
- one shared `resolveInput` callback for create and update;
- per-schema entry limits that may override plugin defaults.

The default factory receives the exact readonly field-resolved create candidate
excluding the ACL field, the optional current principal, and the operation
context. It therefore may derive grants from the row that will be inserted. The
complete candidate, including the generated ACL, is structurally revalidated
and passes validation hooks before Access or business effects. Database-generated
values that do not exist until insertion are unavailable. Create-many invokes
the factory independently for every input row inside the root mutation
transaction.

An accepted explicit ACL takes precedence over the default. The shared input
callback receives a discriminated create or update operation, the proposed ACL,
the current ACL when one exists, the resolved row data, the optional principal,
and context. ACL input is denied by default unless schema configuration accepts
it. Existing ACL updates require `manageAcl` before the callback may replace the
value.

`aclPlugin()` discovers only schemas carrying its owned extension. Plugin-level
options are intentionally limited to default entry limits; schema defaults,
input behavior, Access, hooks, indexes, and transport exposure remain on the
schema.

Subject deletion semantics remain owned by the subject schema or provider.
ACL registers provider-neutral reference inspection and cleanup contributions;
it does not duplicate RoleSchema's `fail`, `preserve`, and `cascade` policy in
plugin options.

### ACL contributes to native Access

The ACL plugin registers extension-targeted input resolution and Access
contributions. Runtime receives only its existing generic hook, guard, row
constraint, and field-restriction contracts and never gains an ACL stage.

Native schema Access, native field Access, ACL, and every other provider combine
monotonically with logical `AND`. ACL cannot broaden an independent denial.
Reads, counts, existence checks, updates, and deletes filter inaccessible rows
inside the adapter so existence is not leaked. The ACL field is selected or
returned only when `manageAcl` permits it.

The ACL contribution declares audited master bypass. Master may read, mutate,
delete, and manage ACL-protected rows, but validation, defaults, input
resolution, business hooks, database constraints, transactions, and audit
delivery still run. A master-created row still receives and persists its
configured default ACL for later non-master requests.

## Consequences

- Applications may use ACL with only public and master access and no user
  schema, authentication plugin, or roles plugin.
- Authentication and roles integrate automatically through neutral Core
  services rather than package imports or plugin-name checks.
- ACL configuration remains schema-local and precisely typed while the plugin
  factory stays option-light.
- PostgreSQL can use one indexed JSONB column without exposing physical details
  through `ACLJSON`.
- Stable serialization, strict parsing, limits, reference cleanup, hooks, and
  live PostgreSQL composition are separate implementation issues in one active
  vertical plan.
