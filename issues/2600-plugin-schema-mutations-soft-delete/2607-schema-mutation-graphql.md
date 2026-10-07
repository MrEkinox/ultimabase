# 2607: Expose plugin-owned schema mutations through GraphQL

- Status: completed
- Milestone: 26
- Packages: `@ultimabase/graphql-plugin`, `@ultimabase/core`
- Depends on: 2603
- ADR: [ADR-0245](../../docs/adr/0245-plugin-schema-mutations-and-soft-delete.md)

## Goal

Compile application-local GraphQL mutation fields from inert schema-mutation
descriptors and execute them through the same late-bound Core facade as direct
and REST requests.

## Acceptance criteria

- [x] ADR-0240's planner gains an exact schema-mutation planning family without
      revealing codecs, handlers, Runtime state, or another plugin's capability
      values.
- [x] GraphQL generates a deterministic field such as `publishPost` from the
      mutation and schema identities only when that schema is exposed and its
      effective GraphQL mutation policy enables plugin mutations.
- [x] Input ID, optional payload, result selection, public errors, nullability,
      output descriptors, and supporting types have one versioned binding
      contract shared with late execution.
- [x] Type, root-field, argument, support-type, operation, owner, and binding
      collisions fail during schema compilation with complete provenance.
- [x] Resolvers accept only `{ request: RequestContext }`, normalize to Core's
      schema-mutation request, and use the narrow application request executor.
- [x] Networkless GraphQL and Yoga preserve validation, Access, Hooks,
      transactions, protected constraints, cancellation, safe error masking,
      Master provenance, and application isolation.
- [x] Application-targeted plugin operations retain their existing explicit
      allowlist and cannot be silently reclassified as schema mutations.
- [x] Documentation and SDL snapshots use a neutral fixture and do not import
      the future soft-delete package.

## Tests

- [x] Schema, execution, SDL, type, packed-package, networkless, Yoga, and
      multi-application tests cover enablement, collisions, selection, errors,
      cancellation, Master, and no-Typegen execution.
- [x] Planner tests prove descriptor parity between static compilation and the
      late executable allowlist.

## Out of scope

- Custom query operations, subscriptions, or a public resolver registry.

## Evidence

- GraphQL now compiles request-authority schema mutations from Core's inert
  `planSchemaMutations()` descriptors. The generated field and wrapper names
  come only from the command and model identity; bindings can describe only an
  optional `input.data` type and a closed supporting-type graph.
- The dedicated late-bound execution facade compares the complete static and
  executable descriptor lists, maps compiled descriptors to Core-owned
  executable identities, and accepts only the schema, ID, payload, selection,
  inclusion, and exact `RequestContext`. Application operations retain their
  separate explicit token allowlist and protocol.
- Neutral tests prove payload and unit inputs, SDL, schema/default enablement,
  root and metadata collisions, safe errors, audited Master provenance,
  cancellation before codec work, application isolation, no-Typegen execution,
  Yoga HTTP, and package exports. Master-only mutations remain absent.
- Repository gates pass: 2,290 tests across 488 files, 150 packed-package tests
  across 26 files, `yarn typecheck`, `yarn build`, `yarn constraints`,
  `yarn check:issues`, `yarn format:check`, `git diff --check`, and `yarn lint`
  with only the existing centralized line-budget warnings.
