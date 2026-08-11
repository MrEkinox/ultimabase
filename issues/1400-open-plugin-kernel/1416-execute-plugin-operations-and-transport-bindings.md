# 1416: Execute plugin operations and explicit transport bindings

- Status: planned
- Milestone: 14
- Packages: `@ultimabase/core`, `@ultimabase/typegen`, `@ultimabase/testing`
- Depends on: 1409, 1410
- ADR: ADR-0042, ADR-0188, ADR-0191, ADR-0192, ADR-0193

## Goal

Turn declared custom operations into application-owned JavaScript and TypeScript
execution handles and expose them to transports only through explicit bindings.

## Acceptance criteria

- [ ] Stable operation tokens and namespaced dynamic operation identities resolve through `ultimabase.operation(tokenOrName).execute(input)`.
- [ ] Schema-targeted operations and plugin model commands use application schema and model handles without mutating exported classes or prototypes.
- [ ] Operation providers own normalization, payload validation, logical execution, result validation, transaction policy, and safe namespaced plugin errors.
- [ ] Execution enters the ordinary RequestEngine, capability middleware, cancellation, automatic transaction, protected constraint, and application lifetime boundaries.
- [ ] Operation handles reject incompatible versions, wrong schema targets, malformed JavaScript payloads, stale applications, and result contract violations with owner diagnostics.
- [ ] Transport exposure requires `transport:expose`, a compatible wire codec, and explicit application or transport exposure configuration.
- [ ] A public transport binding cannot manufacture Master, request Runtime replacement, access a raw adapter, or serialize internal plugin diagnostics.
- [ ] Direct JavaScript execution works without Typegen; Typegen narrows stable tokens, literal dynamic names, schema handles, model handles, inputs, results, and public errors.
- [ ] The generic binding protocol is proven with a fake public transport without implementing the planned REST or GraphQL product packages.

## Tests

- [ ] Runtime, transaction, rollback, cancellation, malformed input, error serialization, disposal, version, and application-isolation suites cover stable and dynamic operations.
- [ ] Type, language-service, source, packed, no-Typegen JavaScript, and fake-transport suites protect the accepted call surface.

## Out of scope

- Building REST, GraphQL, Hono, or another concrete transport.
- Adapter codecs and physical schema bridges; issue 1417 owns them.
