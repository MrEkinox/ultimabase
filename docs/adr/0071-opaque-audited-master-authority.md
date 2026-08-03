# ADR-0071: Opaque audited master authority

- Status: accepted
- Date: 2026-08-01
- Refines: ADR-0013, ADR-0062, ADR-0065
- Refined by: ADR-0090, ADR-0108, ADR-0114

## Context

Server code and authenticated transports need a Parse-inspired master path,
but an operation option, access-shaped object, or transport boolean must never
manufacture authority. Raw credentials must not survive verification, and each
successful elevation needs enough safe metadata for an audit plugin.

## Decision

Runtime exposes a `MasterAuthority` class configured with one or more `{ id,
value }` keys and a mandatory `onUse` handler. It hashes raw values during
construction and retains only fixed-length digests. Verification uses native
timing-safe comparisons and returns an immutable `MasterKeyGrant` whose
constructor is private.

Every authority tracks its own grants by object identity. A `FrameworkEngine`
may own one authority and exposes `authorizeMasterKey(rawKey)`. A grant from
another framework, a structurally similar object, and an invalid raw value all
fail with `PERMISSION_DENIED`.

`RequestEngine.useMasterKey(grant, reason)` requires a non-empty reason and
awaits a `master-access` event before creating the master engine. The event
contains the key ID, reason, timestamp, request ID, source, and previous access,
but never the raw key. Audit failure prevents elevation. The new context keeps
the original source, request identity, safe metadata, and capabilities.

`@ultimabase/access` owns the shared default bypass matrix. Master bypasses CLP,
ACL, and field permissions. Structural validation, SQL constraints,
transactions, business hooks, and tenant isolation are not bypassed. Runtime
continues to execute its policy-neutral lifecycle; installed permission plugins
consult the matrix inside their own hook contributions. Runtime never performs
the permission-specific bypass.

## Consequences

- Transport input can request verification but cannot forge a valid grant.
- Grants cannot cross isolated applications accidentally.
- Multiple operational keys remain distinguishable in audit data.
- Master elevation is asynchronous because audit delivery is mandatory.
- Key restrictions such as allowed sources, schemas, or expiration can extend
  authority verification later without changing `RequestContext`.
