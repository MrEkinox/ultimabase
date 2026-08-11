# ADR-0043: Typed service token identity

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0001
- Refined by: ADR-0190

## Decision

Core exposes `createServiceToken<TService>(debugName)` to create one immutable
nominal token for a service contract. The token carries its service type only
through private symbol metadata; application registries will use the token
object itself as the runtime key.

The debug name is a non-empty diagnostic label. It does not participate in
identity, so two calls using the same name intentionally produce distinct
tokens. Consumers share the exported token value rather than recreating one
from a known string.

Every service token represents one provider slot per application. The service
registry introduced by issue 203 will reject a second provision of the same
token before changing registry state. Tokens do not carry replacement, merge,
or priority options; a future multi-provider contract requires a separate API.

## Consequences

Service lookup retains the exact TypeScript service contract without string
casts or a global name registry. Independent packages may reuse readable debug
names without colliding, while duplicate imports of the same exported token
still refer to one provider slot.

The fixed rejection policy keeps plugin ordering from silently replacing a
service. Intentional decoration must provide a distinct token or use a future
explicit composition mechanism.
