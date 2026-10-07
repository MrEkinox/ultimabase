# ADR-0126: Transactional ACL subject-reference cleanup

- Status: accepted
- Date: 2026-08-04
- Refines: ADR-0117, ADR-0119, ADR-0122, ADR-0125
- Refined by: ADR-0212

## Context

Persisted ACL documents retain exact principal and role identities after the
subject-owning provider deletes its object. Authentication, stored roles, and
community providers must choose whether deletion fails, preserves inert
references, or removes them. ACL cannot own that policy without depending on a
User schema, authentication provider, or concrete roles implementation.

Reference discovery must also remain private from developer Query builders,
use PostgreSQL's existing ACL JSONB index, preserve every unrelated grant, and
participate in the same automatic transaction as subject deletion. Loading one
ACL before its row is locked would allow cleanup to overwrite a concurrent ACL
change.

## Decision

Core retains one nominal `AccessReferenceCleanup` contribution contract. It
also provides a versioned principal reference that encodes an exact Core
Pointer as schema class name plus object ID. Encoding and parsing perform no
schema lookup and create no authentication concept in Core.

`aclPlugin()` registers one application-local cleanup contribution for
principals and one for roles. Each contribution captures only the ACL-enabled
schemas owned by that application. Principal references are parsed through the
Core codec; role references remain provider-owned schema-qualified strings.
ACL never imports or identifies the provider that invokes either contribution.

The subject owner remains solely responsible for policy:

- `fail` calls `hasReferences()` and rejects deletion when any ACL contains the
  exact subject;
- `preserve` does not invoke cleanup and leaves the now-inert value untouched;
- `cascade` requires whatever trusted authority the subject owner defines and
  invokes `cleanup()` within its singular deletion transaction.

ACL reference work uses a package-private asynchronous scope tied to the exact
schema object. While that scope is active, ACL contributes an exact principal
or role containment leaf through an ordinary protected row filter before its
normal master bypass. Business Query state and hooks cannot inspect, replace,
or remove this predicate. The ACL field validates the operand and PostgreSQL's
generic plugin-field compiler lowers it to a parameterized JSONB containment
predicate compatible with the generated GIN index.

Cleanup first selects matching IDs, then executes one ordinary master singular
update per row. The prepared ACL hook ignores the placeholder input and removes
the subject from the currently locked target ACL. Consequently every update
retains unrelated public, authenticated, principal, role, and permission
entries and cannot overwrite a concurrent change observed before row lock.
Normal validation, Access, hooks, and adapter constraints still run. No ACL
cleanup event is emitted.

All discovery and updates inherit the active RequestEngine and transaction.
Failure in a later row or schema rolls back earlier ACL updates and subject
deletion. Application-local registries, captured schema snapshots, exact schema
identity, and request scopes prevent one application from cleaning another.
Subject owners reject set-based deletion whenever their item-specific policy
cannot be executed safely.

## Consequences

- ACL remains optional and independent from authentication and stored roles.
- Community subject providers can reuse the same neutral inspection and cleanup
  protocol.
- PostgreSQL performs indexed reference discovery without an ACL join table or
  an ACL-specific Runtime stage.
- Cascade intentionally executes singular updates so row locks, current-value
  derivation, developer hooks, and rollback semantics remain correct.
- Preserved entries are inert data and may become meaningful again only if the
  subject provider later reuses the exact same stable identity.
