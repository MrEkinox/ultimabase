# 2606: Expose plugin-owned schema mutations through REST

- Status: completed
- Milestone: 26
- Packages: `@ultimabase/rest-plugin`, `@ultimabase/core`
- Depends on: 2603
- ADR: [ADR-0245](../../docs/adr/0245-plugin-schema-mutations-and-soft-delete.md)

## Goal

Generate schema-local REST mutation routes from inert plugin mutation
descriptors and execute them only through Core's narrow request boundary.

## Acceptance criteria

- [x] An eligible mutation contributes one immutable REST v1 binding with exact
      method, schema-relative path segment, ID placement, owner-private input
      codec, schema-owned result contract, and complete public-error status
      mapping.
- [x] REST generates the route only when the application-owned schema itself is
      exposed and its effective REST mutation policy enables plugin mutations.
- [x] The initial neutral route contract supports
      `POST /api/v1/classes/{Schema}/{id}/{mutation-path}` without a generic
      application-operation body workaround.
- [x] Static route planning receives only callback-free attributed descriptors;
      collisions, invalid paths, owner mismatches, duplicate bindings, and
      unsupported values fail before transport startup.
- [x] Execution binds the route-selected schema, mutation, ID, decoded input,
      and exact `RequestContext` to Core's application request executor.
- [x] Safe errors, body budgets, cancellation, public-protection diagnostics,
      anonymous and audited Master contexts, and application selection retain
      the existing REST boundary.
- [x] REST never receives a handler, engine, adapter, persistence plan,
      protected constraint, authority grant, or lifecycle facade.
- [x] Generated route metadata and package documentation use a neutral workflow
      mutation fixture and remain independent from the soft-delete package.

## Tests

- [x] Route, Fetch, type, packed-package, and multi-application tests cover
      enablement, collisions, malformed bodies and IDs, safe errors, Master,
      cancellation, and no-Typegen execution.
- [x] Tests prove application operations keep their existing `/operations`
      contract and cannot impersonate schema mutations.

## Out of scope

- A generic REST action registry or automatic exposure of private operations.

## Evidence

- Core now exposes an owner-validated nominal payload codec, static
  `planSchemaMutations()` descriptors, and a distinct late-bound
  `exposeSchemaMutations()` allowlist without exposing handlers, engines,
  adapters, plans, constraints, or grants.
- REST compiles request-authority schema mutations to the fixed
  `POST /api/v1/classes/{Schema}/{id}/{command-kebab-case}` contract and applies
  schema-local enablement, UUID-v7 validation, bounded JSON normalization,
  schema result codecs, safe public-error statuses, and the shared HTTP context.
  Master-only mutations stay direct server commands.
- Focused Core and REST suites passed 88 tests across 17 files; packed optional
  public API coverage passed 22 tests. The complete unit suite passed 2,287
  tests across 487 files, including real Hono and Chromium boundaries.
- Repository gates pass: `yarn constraints`, `yarn check:issues`,
  `yarn format:check`, `yarn typecheck`, `yarn test`, `yarn lint` (baseline
  line-budget warnings only), `yarn build`, and `git diff --check`.
