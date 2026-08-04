# ADR-0117: Optional Access subject capabilities

- Status: accepted
- Date: 2026-08-03
- Refines: ADR-0043, ADR-0090, ADR-0113, ADR-0116
- Refined by: ADR-0122, ADR-0126

## Context

Authentication and role membership are optional plugin concerns, while CLP,
ACL, and community policy providers need a stable way to consume them. A
permission provider must not import a concrete authentication or role plugin,
identify it by name, or depend on its configuration position.

Typed request values already represent dynamic plugin-owned identity. Typed
service tokens already represent application-local provider identities. The
missing primitive is a conditional static requirement: a role-aware policy may
need a resolver that a later plugin provides, while the same policy package
must remain usable without a resolver when no configured rule references a
role.

## Decision

Core reuses its nominal primitives instead of creating a native User, session,
or role implementation.

- `AccessSubjectValue<T>` gives `RequestContextValue<T>` an Access-domain name
  while retaining token identity and exact principal inference.
- `AccessSubjectReference<TKind, TValue>` is an immutable nominal reference
  whose primitive value is owned by the policy domain.
- `AccessSubjectResolver<TReference, TSubject>` is the generic asynchronous
  resolution contract. `undefined` represents unavailable request-local
  identity and therefore cannot grant access.
- `AccessPrincipalResolver` and `accessPrincipalResolverServiceToken` expose one
  optional exact Core Pointer without defining authentication. The shared
  resolution helper validates nominal Pointer identity and exact application
  schema ownership before a policy consumes it.
- `AccessRoleReference` and `AccessRoleResolver` define the neutral role
  membership boundary. `accessRoleResolverServiceToken` identifies that
  contract without exposing an official provider plugin.

An owner-bound plugin service registry exposes `require(token)`. It returns a
typed `RequiredPluginService<T>` reference that may be captured by an Access
contribution before the provider executes. After every plugin setup completes,
Core validates all recorded requirements before `connect` or another
infrastructure lifecycle phase runs. Missing services fail setup with the
requesting plugin and neutral token in diagnostics.

Requiring is conditional configuration work. A CLP or ACL plugin calls it only
when its normalized declarations contain a role subject. Merely installing a
permission package creates no role requirement. Duplicate provision of the
same token remains an error, and requirements resolve only against the service
registry of their own application.

Dynamic subject values remain optional at the context boundary. A configured
Access rule that needs one reads its nominal token and returns denial when the
value is absent. Core does not convert absence into authenticated authority and
does not infer a user from transport data.

## Consequences

- Official and community auth or role providers can satisfy the same neutral
  contracts by sharing token identity.
- Consumer setup no longer depends on provider configuration order or plugin
  implementation names.
- Missing static capabilities fail before database or transport startup, while
  missing request-local identity fails closed during Access execution.
- Core still has only anonymous and master authority and owns no user schema,
  role persistence, membership graph, credential, or session contract.
