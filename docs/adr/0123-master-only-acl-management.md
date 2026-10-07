# ADR-0123: Master-only ACL management

- Status: accepted
- Date: 2026-08-04
- Refines: ADR-0113, ADR-0116, ADR-0122
- Supersedes: the ACL-right vocabulary and ACL-field management decisions in ADR-0122

## Context

ADR-0122 introduced a grantable `manageAcl` right so selected principals or
roles could inspect and replace an object's ACL. That model lets an otherwise
restricted request broaden future access to an object and makes an ordinary
object update depend on a second row-aware permission.

UltimaBase already has trusted server-side master authority and native field
Access. The framework can therefore separate business mutations from security
document management without storing another permission in every ACL.

## Decision

The closed ACL permission vocabulary is `read`, `update`, and `delete`.
`manageAcl` is removed from the public value, JSON representation, database
constraints, and provider logic.

Only trusted master execution may:

- supply an explicit ACL during create;
- select, filter, or order by the reserved ACL field;
- replace an existing ACL value.

Non-master creates may still receive a schema-configured ACL default. The
default factory may use the optional current principal to grant ordinary object
rights, but those rights never authorize later ACL management.

The shared schema `resolveInput` callback remains available for create and
update so applications can normalize master-supplied ACL values. Update
resolution receives the locked current ACL and runs inside the operation's
automatic transaction. Set-based ACL replacement remains unsupported because
it cannot provide one deterministic current ACL without materializing rows.

The plugin declares its ACL-field restriction through native Access with
audited master bypass. Runtime remains policy-neutral and never names ACL or
master-only ACL management.

## Consequences

- Granting object `update` can no longer let a principal expand or persist its
  own authority.
- Applications do not need to reason about a fourth ACL right.
- The ACL field is absent from non-master output and rejected when explicitly
  selected or mutated.
- Server business logic must opt into master execution when it intentionally
  changes an ACL.
- Existing ADR-0122 text remains historical; this ADR governs conflicting
  permission and field-management statements.
