# 609: Implement the GraphQL plugin lifecycle and structural schema

- Status: completed
- Milestone: 6
- Packages: `@ultimabase/graphql-plugin`, `@ultimabase/acl-permissions-plugin`, `@ultimabase/pg-vector-plugin`
- Depends on: 608
- ADR: ADR-0010 and ADR-0238

## Goal

Create the network-independent GraphQL plugin and compile its deterministic
structural object and input schema from the complete application graph.

## Acceptance criteria

- [x] A complete publishable `packages/graphql-plugin` workspace exports the
      accepted `graphqlPlugin()` API; no empty placeholder or Core deep import
      is introduced.
- [x] The plugin uses versioned declaration or application capabilities with
      exact owner and instance provenance and materializes only after the final
      compiled schema graph exists.
- [x] Global and direct per-schema GraphQL exposure options follow the accepted
      defaults, reject plugin-owned private schemas where required, remain
      immutable, and stay separate from authorization.
- [x] Object, create, update, enum, JSON, list, temporal, decimal, bigint,
      binary, pointer, relation, embedded-object, and system-field contracts
      match the final Core field graph.
- [x] Create and update inputs include only fields legal for the corresponding
      Core command, preserving generated, immutable, required, nullable, list,
      and nested-field semantics.
- [x] GraphQL names are deterministic, valid, collision-checked across generated
      and reserved surfaces, and retain schema and plugin provenance in startup
      diagnostics.
- [x] Dynamic output restrictions remain sound under the nullability and error
      contract accepted by issue 608 without importing a policy package.
- [x] Plugin-defined fields compile only when their exact canonical GraphQL wire
      protocol and owner codecs are available; storage and REST codecs are never
      reused implicitly.
- [x] ACL and pg-vector attach exact canonical GraphQL JSON codecs without
      importing the GraphQL package, proving the owner-side protocol boundary
      for the two shipped plugin-defined fields.
- [x] Static compilation performs no Runtime execution, request work, network
      access, schema-global mutation, or infrastructure materialization.
- [x] Typegen contributes only inert application-specific GraphQL option and
      schema-surface declarations where they improve authoring.

## Tests

- [x] Schema snapshots cover every built-in field, dynamic plugin-owned schemas,
      duplicate GraphQL plugin rejection, repeated compilation, collisions,
      missing codecs, application isolation, and lifecycle cleanup.
- [x] Source, built, JavaScript, Typegen-free, generated TypeScript, and packed
      consumers use only public package exports.

## Out of scope

- Executing an operation, mounting HTTP, importing Yoga, or evaluating a
  concrete Access, ACL, authentication, or database provider.
