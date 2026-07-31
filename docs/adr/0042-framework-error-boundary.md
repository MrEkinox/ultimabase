# ADR-0042: Framework error boundary

- Status: accepted
- Date: 2026-07-31

## Decision

Core exposes one `FrameworkError` class with a closed initial union of stable
framework codes. The initial codes are `VALIDATION_ERROR`, `NOT_FOUND`,
`PERMISSION_DENIED`, `MASTER_ACCESS_DENIED`, `MISSING_EXECUTION_CONTEXT`,
`PLUGIN_DEPENDENCY_MISSING`, `PLUGIN_CONFLICT`, `TRANSACTION_ERROR`, and
`INTERNAL_ERROR`.

The regular `Error.message`, stack, cause, and `internalDetails` belong to the
trusted diagnostic boundary. They are never included by `toJSON`. A caller may
explicitly provide a safe `publicMessage` and `publicDetails`; only those values,
the stable code, and the transport-neutral `retryable` flag enter the immutable
public payload.

`FrameworkError` preserves the native ECMAScript `cause` chain instead of
inventing a parallel representation. Public and internal detail records are
copied and shallowly frozen when the error is constructed. Their generic types
retain exact caller-provided keys without exposing an untyped escape hatch.

Core does not attach HTTP statuses, GraphQL extensions, or gRPC status codes.
Each transport owns that mapping and must serialize the safe payload rather
than the diagnostic error object.

## Consequences

Framework packages can branch exhaustively on stable codes while transports
share one safe serialization boundary. Internal messages and database, plugin,
or cause details cannot leak merely because an error is passed to
`JSON.stringify`.

New framework codes are public API additions. A future community-error
extension mechanism requires a separate decision rather than weakening the
closed framework union to arbitrary strings.
