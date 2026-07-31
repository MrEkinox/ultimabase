# ADR-0056: Protected opaque Query cursors

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0004, ADR-0052, ADR-0055

## Decision

Forward cursor pagination uses a versioned, transport-neutral payload containing
the schema class, exact order fields and directions, and the corresponding last
returned values. Version 1 is identified by `queryCursorVersion`. The payload
format is a server contract and clients only receive an opaque cursor string.

`QueryCursorCodec` is the application-provided integrity boundary. Its `seal`
operation produces a non-empty token, and `unseal` must authenticate the token
before returning unknown payload data. Implementations may use a signature,
message authentication code, or authenticated encryption. Reversible encoding
without tamper detection does not satisfy the contract. Query owns no secrets
and does not depend on a concrete cryptography or storage implementation.

Cursor ordering is total and deterministic. The framework UUID `id` is always
the final order term. When absent, it inherits the direction of the final
developer order term, or uses ascending order when no term exists. An explicit
`id` order is moved last while retaining its requested direction.

Unsealed payloads are treated as untrusted input. Query validates their shape,
version, final primary-key term, schema class, and exact ordering before
returning immutable normalized records. Ordering values remain `unknown`
because database and field plugins own their serialization and comparison
semantics.

Malformed, unauthenticated, or modified tokens throw `QueryCursorError` with
`CURSOR_INVALID`. Structurally valid cursors for another version, schema, or
ordering throw `CURSOR_INCOMPATIBLE`. Query defines this domain error locally so
it does not import Core; Runtime will map it to the appropriate framework error
at its boundary.

## Consequences

Database adapters can implement keyset predicates from one stable order without
leaking SQL or serialized field formats into Query. REST, GraphQL, and direct
TypeScript callers share the same opaque token and compatibility rules. A
changed query shape fails explicitly instead of silently producing gaps or
duplicates.

Applications must configure a secure codec before cursors can cross a client
boundary. Key rotation, expiry, backward pagination, and concrete cryptographic
implementations remain separate capabilities and can evolve without changing
the Query AST discriminants.
