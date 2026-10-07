# 2306: Generate REST route metadata

- Status: completed
- Milestone: 23
- Packages: `@ultimabase/rest-plugin`, `@ultimabase/http-plugin`, `@ultimabase/typegen`
- Depends on: 2302, 2303
- ADR: ADR-0004, ADR-0193, ADR-0209, ADR-0224, ADR-0225 and the issue 2302 REST contract

## Goal

Generate deterministic owned REST route declarations from the complete
application graph without executing Runtime or importing Hono.

## Acceptance criteria

- [x] Create a complete publishable `packages/rest-plugin` workspace exporting
      `restPlugin()`.
- [x] Collection and item paths derive from compiled schema naming and the
      accepted REST v1 contract, with deterministic collision diagnostics.
- [x] Find, get, count, create, update, delete, upsert, and itemized bulk routes
      can be enabled or disabled at the accepted global, schema, and operation
      levels.
- [x] Route exposure configuration is immutable and remains separate from
      Access, ACL, authentication, and public-protection acknowledgement.
- [x] Route metadata retains exact schema, plugin, application, method, path,
      operation, and protocol-version provenance.
- [x] Dynamic plugin-contributed schemas participate through the compiled graph;
      removed or disabled schemas leave no stale route.
- [x] The accepted provenance-aware defaults never expose credential, session,
      maintenance, or another plugin-owned storage schema automatically.
- [x] Every enabled schema-route surface uses Core's shared
      `UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION` reporting and exact application
      acknowledgement rather than a REST-specific warning.
- [x] Static declaration performs no Runtime execution, filesystem read,
      listener startup, or infrastructure work.
- [x] Typegen contributes only inert REST route and option declarations where
      they improve exact application typing.

## Tests

- [x] Route snapshots cover naming, enablement, conflicts, dynamic schemas,
      two instances, two applications, repeated compilation, and removal.
- [x] Language-service tests verify option completion and hover documentation.

## Out of scope

- Parsing requests, executing operations, starting Hono, or generating OpenAPI.
