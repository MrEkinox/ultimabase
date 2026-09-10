# 2607: Expose plugin-owned schema mutations through GraphQL

- Status: planned
- Milestone: 26
- Packages: `@ultimabase/graphql-plugin`, `@ultimabase/core`
- Depends on: 2603
- ADR: [ADR-0245](../../docs/adr/0245-plugin-schema-mutations-and-soft-delete.md)

## Goal

Compile application-local GraphQL mutation fields from inert schema-mutation
descriptors and execute them through the same late-bound Core facade as direct
and REST requests.

## Acceptance criteria

- [ ] ADR-0240's planner gains an exact schema-mutation planning family without
      revealing codecs, handlers, Runtime state, or another plugin's capability
      values.
- [ ] GraphQL generates a deterministic field such as `publishPost` from the
      mutation and schema identities only when that schema is exposed and its
      effective GraphQL mutation policy enables plugin mutations.
- [ ] Input ID, optional payload, result selection, public errors, nullability,
      output descriptors, and supporting types have one versioned binding
      contract shared with late execution.
- [ ] Type, root-field, argument, support-type, operation, owner, and binding
      collisions fail during schema compilation with complete provenance.
- [ ] Resolvers accept only `{ request: RequestContext }`, normalize to Core's
      schema-mutation request, and use the narrow application request executor.
- [ ] Networkless GraphQL and Yoga preserve validation, Access, Hooks,
      transactions, protected constraints, cancellation, safe error masking,
      Master provenance, and application isolation.
- [ ] Application-targeted plugin operations retain their existing explicit
      allowlist and cannot be silently reclassified as schema mutations.
- [ ] Documentation and SDL snapshots use a neutral fixture and do not import
      the future soft-delete package.

## Tests

- [ ] Schema, execution, SDL, type, packed-package, networkless, Yoga, and
      multi-application tests cover enablement, collisions, selection, errors,
      cancellation, Master, and no-Typegen execution.
- [ ] Planner tests prove descriptor parity between static compilation and the
      late executable allowlist.

## Out of scope

- Custom query operations, subscriptions, or a public resolver registry.
