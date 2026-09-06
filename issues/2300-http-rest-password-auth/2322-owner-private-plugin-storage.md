# 2322: Implement owner-private plugin storage

- Status: planned
- Milestone: 23
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`, `@ultimabase/postgres-plugin`, `@ultimabase/typegen`, `@ultimabase/testing`
- Depends on: 2318
- ADR: ADR-0187, ADR-0191, ADR-0192, ADR-0193, ADR-0234

## Goal

Implement Core's exact owner-private record boundary so Password Auth can store
credential and session verifiers without exposing them as application schemas,
issuing raw adapter calls, or depending on Access.

## Acceptance criteria

- [ ] Add the critical `storage:private` privilege and reject denial before
      private declaration, adapter, migration, setup, connection, Runtime, or
      transport effects.
- [ ] Authorized plugins declare callback-free private collection descriptors
      with stable contribution identity, portable fields, unique indexes,
      public-schema references, normalized static options, and complete owner
      and version provenance.
- [ ] Private collections participate in the application fingerprint, adapter
      compilation, physical schema intent, upgrade metadata, orphan handling,
      and deterministic application isolation without entering the public
      compiled schema registry.
- [ ] Core materializes an opaque handle only for callbacks owned by the exact
      declaring plugin instance; another plugin, instance, application,
      transport, Query, operation input, or structural lookalike cannot acquire
      or forge it.
- [ ] The v1 handle exposes typed `findUnique`, `insert`, `update`, `delete`, and
      compare-and-swap operations only for the owner's declared collections;
      it exposes no scan, general filter, include, aggregation, relation loader,
      bulk mutation, adapter, SQL, engine, application registry, transaction
      controller, persistence plan, or authority grant.
- [ ] Reads reuse the active request without forcing a transaction. Mutations
      reuse the active transaction and otherwise receive one automatic
      transaction; an ordinary schema mutation and private writes can commit or
      roll back atomically through the same selected adapter.
- [ ] Core structural validation, cancellation, unique constraints, exact
      compare-and-swap conflicts, application isolation, and portable `fail` or
      `cascade` references to public schemas are enforced.
- [ ] Private records never enter public Query or model handles, Typegen schema
      declarations, REST or GraphQL route metadata, Hooks, Access, application
      validators, protected policies, Runtime observers, events, diagnostics,
      or serialization.
- [ ] PostgreSQL compiles and executes the private descriptors through public
      Core capability and adapter contracts; Core imports no PostgreSQL and no
      plugin executes raw SQL.
- [ ] Applications without private storage retain no private descriptor,
      runtime allocation, adapter work, Typegen output, migration fact, or
      diagnostic noise.
- [ ] Public APIs use exact generics, immutable values, English JSDoc, and no
      `any`; Plugin Kit helpers may reduce declaration duplication without
      weakening Core ownership checks.

## Tests

- [ ] Declaration, privilege, ownership, lifecycle, structural validation,
      unique lookup, mutation, compare-and-swap race, rollback, public-reference
      deletion, application isolation, two-instance isolation, upgrade,
      orphaning, disposal, and zero-consumer tests.
- [ ] Negative Query, application-handle, Typegen, REST metadata, callback,
      transport, raw-adapter, forged-handle, cross-owner, and secret-observer
      tests.
- [ ] Source, built, JavaScript, packed-package, language-service, PostgreSQL,
      and conformance coverage through public exports.

## Out of scope

- Password Auth, User schemas, password hashing, credentials, sessions, HTTP,
  cookies, authentication, authorization, caches, secret managers, key vaults,
  or database administration.
- Private application schemas, hidden public-model fields, arbitrary private
  queries, cross-owner storage, or a general repository service.
