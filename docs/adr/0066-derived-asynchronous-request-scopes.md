# ADR-0066: Derived asynchronous request scopes

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0013, ADR-0050, ADR-0062, ADR-0065

## Decision

`@ultimabase/runtime` provides optional contextual request access through
Node.js `AsyncLocalStorage`. Explicit `RequestEngine` injection remains the
primary transport and service API. Contextual helpers are intended for internal
layers where repeatedly forwarding the same engine would add noise without
making ownership clearer.

`runWithRequestEngine(requestEngine, callback)` is the only public scope writer.
It accepts one real `RequestEngine` rather than independently accepting an
application, framework engine, request engine, and request context. Runtime
derives one immutable `ActiveFrameworkContext` containing `application`,
`frameworkEngine`, `requestEngine`, and `request`. Those references therefore
cannot describe different applications or requests.

`getCurrentFrameworkContext()` returns that immutable view. Focused helpers
return its application, application-wide engine, request engine, or request
context. All readers throw a `FrameworkError` with code
`MISSING_EXECUTION_CONTEXT` outside an active scope. They never return
`undefined`, fall back to a global engine, or reuse a previous request.

The module owns one `AsyncLocalStorage` instance but no mutable current-context
variable. Native scope propagation provides nested restoration, promise-chain
isolation, and cleanup after synchronous throws. Callback return values remain
untouched, including promises.

Context-free getters intentionally return the safe widened engine and context
types because TypeScript cannot prove which runtime scope is active. Code that
needs the exact application plugin tuple or exact access mode continues to use
the explicitly injected request engine.

## Consequences

REST, GraphQL, jobs, hooks, and custom transports can wrap their complete
handler once, while deeply nested framework code can access the correct request
without mutable singletons. Parallel applications and requests remain isolated
even when their asynchronous work interleaves.

Opening a scope from a preassembled context object is not supported. This keeps
the request engine as the single source of truth and removes a validation and
maintenance surface. Transports remain responsible for constructing and
injecting the correct request engine before starting the scope.
