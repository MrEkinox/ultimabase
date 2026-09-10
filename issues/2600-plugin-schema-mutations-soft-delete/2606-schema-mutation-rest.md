# 2606: Expose plugin-owned schema mutations through REST

- Status: planned
- Milestone: 26
- Packages: `@ultimabase/rest-plugin`, `@ultimabase/core`
- Depends on: 2603
- ADR: [ADR-0245](../../docs/adr/0245-plugin-schema-mutations-and-soft-delete.md)

## Goal

Generate schema-local REST mutation routes from inert plugin mutation
descriptors and execute them only through Core's narrow request boundary.

## Acceptance criteria

- [ ] An eligible mutation contributes one immutable REST v1 binding with exact
      method, schema-relative path segment, ID placement, input codec, result
      codec, and complete public-error status mapping.
- [ ] REST generates the route only when the application-owned schema itself is
      exposed and its effective REST mutation policy enables plugin mutations.
- [ ] The initial neutral route contract supports
      `POST /api/v1/classes/{Schema}/{id}/{mutation-path}` without a generic
      application-operation body workaround.
- [ ] Static route planning receives only callback-free attributed descriptors;
      collisions, invalid paths, owner mismatches, duplicate bindings, and
      unsupported values fail before transport startup.
- [ ] Execution binds the route-selected schema, mutation, ID, decoded input,
      and exact `RequestContext` to Core's application request executor.
- [ ] Safe errors, body budgets, cancellation, public-protection diagnostics,
      anonymous and audited Master contexts, and application selection retain
      the existing REST boundary.
- [ ] REST never receives a handler, engine, adapter, persistence plan,
      protected constraint, authority grant, or lifecycle facade.
- [ ] Generated route metadata and package documentation use a neutral workflow
      mutation fixture and remain independent from the soft-delete package.

## Tests

- [ ] Route, Fetch, type, packed-package, and multi-application tests cover
      enablement, collisions, malformed bodies and IDs, safe errors, Master,
      cancellation, and no-Typegen execution.
- [ ] Tests prove application operations keep their existing `/operations`
      contract and cannot impersonate schema mutations.

## Out of scope

- A generic REST action registry or automatic exposure of private operations.
