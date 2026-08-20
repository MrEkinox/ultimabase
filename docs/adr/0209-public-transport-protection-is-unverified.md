# ADR-0209: Public transport protection remains unverified

- Status: accepted
- Date: 2026-08-20
- Refines: ADR-0194, ADR-0205
- Depends on: ADR-0193, ADR-0205

## Context

ADR-0194 introduced `UNPROTECTED_PUBLIC_TRANSPORT` when an application exposed
public operations without a protected policy contribution. After ADR-0205,
Core can observe generic protected-policy contributions but cannot infer which
schemas, operation families, items, fields, relations, or values an arbitrary
policy covers.

The existing implementation silences the warning as soon as any protected
policy is installed. A no-op policy, a policy for an unrelated schema, or a
partial policy therefore appears to prove complete protection of every exposed
operation even though Core has no such evidence.

## Decision

Core reports public transport protection as unverified unless the developer
explicitly acknowledges that state for the exposure.

The diagnostic is named `UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION`. Its immutable
structured data reports:

- whether at least one generic protected-policy provider is present;
- that complete coverage of the exposed operations remains `unverified`;
- the exact public transport protocol name and version.

Provider presence is inventory information, not a security guarantee. The
warning therefore remains visible for official Access, ACL, independent policy
engines, no-op policies, and policies unrelated to the exposed operation.
Core names none of those products.

`acknowledgeUnverifiedProtection: true` is the only accepted acknowledgement.
It silences the warning for that exposure but does not create policy behavior,
grant authority, declare coverage, or change execution. Without
acknowledgement, Core emits at most one warning per nominal transport protocol
and application. Separate applications retain independent warning state.

Core does not introduce a complete-coverage declaration in this decision. A
truthful declaration would need stable semantics for operation targets,
transitive nested Runtime work, provider composition, and evolving policy
plans. Provider-authored callbacks cannot generically prove those properties,
and a self-asserted boolean would only replace one misleading signal with
another. A future coverage protocol requires its own ADR and executable proof
contract.

The former `UNPROTECTED_PUBLIC_TRANSPORT`,
`UnprotectedPublicTransportWarning`, and `acknowledgeUnprotected` names are
removed rather than retained as aliases because their semantics imply a
provider-absence guarantee that is no longer true.

## Consequences

- Installing any policy provider can no longer silently claim complete public
  transport protection.
- Developers can distinguish no provider from provider-present-but-unverified
  without Core learning a product vocabulary.
- Applications using a deliberate public or partially protected surface must
  acknowledge the exact uncertainty explicitly.
- The warning may be noisier for applications with real policies, but it no
  longer overstates what Core can prove.

## Non-goals

- Proving arbitrary business-policy correctness.
- Defining a universal Access, ACL, authentication, or policy vocabulary.
- Installing a neutral Runtime policy stage when none exists.
- Treating developer acknowledgement as a security control.
