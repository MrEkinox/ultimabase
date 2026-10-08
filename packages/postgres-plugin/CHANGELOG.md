# @ultimabase/postgres-plugin

## 1.0.0

### Major Changes

- 7f19661: Rename every official plugin package with an explicit `-plugin` suffix so its
  installation role is visible from imports and package metadata.

### Minor Changes

- 7d01386: Add application-isolated versioned adapter constraint compilers with safe parameterized PostgreSQL predicate composition.
- 3b621cb: Compile ordinary, unique, and composite schema indexes with deterministic
  length-safe PostgreSQL names and reusable upsert-target metadata.
- 6bca47a: Execute singular PostgreSQL CRUD through private parameterized Drizzle queries
  with shared codecs, deterministic mutation targets, and sanitized driver errors.
- 5cf1a48: Compile native Access row filters beside developer predicates and contributed
  database constraints for reads and mutation targets.
- 09d6e36: Migrate ACL authorization and reference discovery to field-owned portable
  containment filters compiled by PostgreSQL without a dedicated bridge plugin.
- 3a48ec6: Persist plugin-owned JSON values through versioned portable codecs, store ACLs
  as indexed row-local PostgreSQL JSONB, and resolve role names to stable UUID
  references before persistence.
- 7f569ec: Add versioned adapter support negotiation, attributed physical and migration
  bridges, revocable raw adapter leases, PostgreSQL bridge compilation, and an
  immutable migration-history test fixture.
- d2c2c44: Execute explicit Runtime transactions through one borrowed PostgreSQL client
  with sanitized lifecycle failures and exact commit, rollback, and release
  ownership.
- 1850f1c: Replace named permission stages with policy-neutral monotonic enforcement hooks and generic database constraints.
- 68c466d: Add typed URL and existing-pool configuration with lifecycle connection
  verification, explicit resource ownership, sanitized failures, and clean
  application disposal.
- 96207e7: Add plural snake-case PostgreSQL table naming and the typed `postgresTable`
  schema extension for exact safely escaped identifiers.
- 749f558: Add transactional direct schema policies and explicit PostgreSQL column rename metadata.
- 35c83e7: Read deterministic PostgreSQL catalog snapshots that distinguish managed
  tables and explicitly report unsupported live structures.
- b9b406c: Add typed result selections to upsert, create-many, and upsert-many commands,
  with canonical bulk command envelopes and PostgreSQL result projection that
  retains complete private mutation materializations.
- 4f72629: Register Runtime's portable database-adapter service around an internal Drizzle
  client while keeping Drizzle and concrete driver types out of public exports.
- f1c0d67: Execute PostgreSQL create-many, update-many, delete-many, upsert-one, and
  upsert-many operations through Runtime's prepared transaction protocol.

  Non-atomic create and upsert collections recover failed items through private
  PostgreSQL savepoints and return the typed successful-prefix result. Unique
  target equality values now seed the create candidate before hooks and reject
  contradictory create values.

- b9d2bb9: Enforce persisted object ACLs through native Access constraints, master-only ACL
  management, request-local principal and role resolution, and locked singular
  update input resolution without exposing ACL policy to Core Runtime.
- aebad56: Add immutable draft and persisted model commands with selection-safe protected
  PostgreSQL object identity, refresh and existence reads, and local pointer
  identity helpers.
- 8e14070: Compile built-in schemas into private Drizzle table metadata with explicit
  PostgreSQL types, static defaults, system generation facts, and lossless JSONB
  codecs.
- 9b9c9db: Add typed `some`, `none`, and `every` relation predicates with monotonic target
  Access and correlated parameterized PostgreSQL compilation.

### Patch Changes

- 5abbb7f: Publish focused immutable plugin-authoring helpers and migrate official plugins
  to the shared package manifest and options boundaries without behavior changes.
- 716634d: Add transaction-bound prepared mutation outcomes with complete private field materializations and singular PostgreSQL target locking.
- 6d94ce4: Share one cardinality-aware prepared-create planner for singular and collection
  mutations without changing transaction or persistence semantics.
- ce42766: Publish the public plugin conformance harness with exact failure contracts,
  automatic lifecycle cleanup, optional Typegen and domain checks, and adoption
  across the official plugin packages.
- 82dc312: Consolidate Schema, Query, Access, application orchestration, and Runtime under
  the single `@ultimabase/core` public entry point. Official plugins now depend on
  that cohesive foundational package instead of synchronized internal packages.
- aa06563: Make private-storage adapter requests an exact discriminated union and document
  the closed addressable-record boundary.
- 92969f9: Replace schema instances with constructible classes returned by `Schema.define`,
  add immutable typed drafts and static Query access, and materialize public
  Runtime results as exact schema-class instances after output restrictions.
- e923c6b: Normalize PostgreSQL temporal results to Schema's canonical ISO values and add
  the first live Runtime-to-PostgreSQL singular CRUD specification. Accept native
  `pg` result instances at the internal structural query boundary.
- f8b65e4: Compile normalized Query filters into parameterized internal Drizzle expressions.
- 9f70dbf: Compile stable PostgreSQL selections, ordering, offsets, and cursor predicates,
  and allow Query builders to explicitly select their first cursor page.
- Updated dependencies [f4baae2]
- Updated dependencies [4d9cfbf]
- Updated dependencies [2d89051]
- Updated dependencies [629948d]
- Updated dependencies [7d01386]
- Updated dependencies [206bec5]
- Updated dependencies [5abbb7f]
- Updated dependencies [fa5fe82]
- Updated dependencies [87bdad1]
- Updated dependencies [c7f1d33]
- Updated dependencies [74dc247]
- Updated dependencies [4d63866]
- Updated dependencies [c57b835]
- Updated dependencies [ac7554f]
- Updated dependencies [235040c]
- Updated dependencies [9db27e7]
- Updated dependencies [64e22b0]
- Updated dependencies [abd708e]
- Updated dependencies [65b5c66]
- Updated dependencies [9315355]
- Updated dependencies [84a0186]
- Updated dependencies [56024ac]
- Updated dependencies [54e784c]
- Updated dependencies [3a48ec6]
- Updated dependencies [7f569ec]
- Updated dependencies [4d24000]
- Updated dependencies [0eacd98]
- Updated dependencies [1806b81]
- Updated dependencies [aec4cd0]
- Updated dependencies [331a76b]
- Updated dependencies [76b676e]
- Updated dependencies [462a850]
- Updated dependencies [a2b1717]
- Updated dependencies [a6aa8da]
- Updated dependencies [32767cf]
- Updated dependencies [4bab922]
- Updated dependencies [13b797f]
- Updated dependencies [716634d]
- Updated dependencies [114d5a1]
- Updated dependencies [7aac6de]
- Updated dependencies [1850f1c]
- Updated dependencies [e21fffc]
- Updated dependencies [e029de6]
- Updated dependencies [65d47ee]
- Updated dependencies [d8362f0]
- Updated dependencies [571f4bc]
- Updated dependencies [206bec5]
- Updated dependencies [b8cbf6e]
- Updated dependencies [6f9f2e1]
- Updated dependencies [deef6c3]
- Updated dependencies [42e65b6]
- Updated dependencies [41e0fbb]
- Updated dependencies [0977e8d]
- Updated dependencies [b0f865e]
- Updated dependencies [222377f]
- Updated dependencies [760353e]
- Updated dependencies [2f6e99c]
- Updated dependencies [82dc312]
- Updated dependencies [684aa4b]
- Updated dependencies [d3e1a24]
- Updated dependencies [0c03b5b]
- Updated dependencies [0fc8343]
- Updated dependencies [a217e52]
- Updated dependencies [82b71fc]
- Updated dependencies [6115be0]
- Updated dependencies [849ac30]
- Updated dependencies [9af9e98]
- Updated dependencies [30920cc]
- Updated dependencies [76f691d]
- Updated dependencies [dc472fc]
- Updated dependencies [2642045]
- Updated dependencies [9ca5850]
- Updated dependencies [aa06563]
- Updated dependencies [47e10e5]
- Updated dependencies [de8698c]
- Updated dependencies [2635caa]
- Updated dependencies [7d78026]
- Updated dependencies [1dfd965]
- Updated dependencies [ac75b10]
- Updated dependencies [92969f9]
- Updated dependencies [190f5b2]
- Updated dependencies [206bec5]
- Updated dependencies [e4f93e3]
- Updated dependencies [74b91d6]
- Updated dependencies [86c2d06]
- Updated dependencies [1b08f1c]
- Updated dependencies [b11c11f]
- Updated dependencies [fd1a7fd]
- Updated dependencies [79487b0]
- Updated dependencies [e22a540]
- Updated dependencies [9c4139e]
- Updated dependencies [b872410]
- Updated dependencies [fffc6c8]
- Updated dependencies [4978621]
- Updated dependencies [b9b406c]
- Updated dependencies [753dc67]
- Updated dependencies [8c799af]
- Updated dependencies [143502f]
- Updated dependencies [e1f4c66]
- Updated dependencies [eba2dcf]
- Updated dependencies [740d586]
- Updated dependencies [25a4525]
- Updated dependencies [1ff75ac]
- Updated dependencies [a34e05a]
- Updated dependencies [c6c88c3]
- Updated dependencies [ed1192b]
- Updated dependencies [829cf82]
- Updated dependencies [fcf1a72]
- Updated dependencies [1cb87a3]
- Updated dependencies [6681117]
- Updated dependencies [f1c0d67]
- Updated dependencies [c7f1d33]
- Updated dependencies [5e8d4e2]
- Updated dependencies [552985c]
- Updated dependencies [fa7148f]
- Updated dependencies [1f7b08a]
- Updated dependencies [198ee97]
- Updated dependencies [1e28819]
- Updated dependencies [e46bcce]
- Updated dependencies [e133642]
- Updated dependencies [b9d2bb9]
- Updated dependencies [396e4f4]
- Updated dependencies [d883791]
- Updated dependencies [9f70dbf]
- Updated dependencies [61def14]
- Updated dependencies [76cf66b]
- Updated dependencies [07f07ef]
- Updated dependencies [aebad56]
- Updated dependencies [8505935]
- Updated dependencies [6aa2103]
- Updated dependencies [a6c75bb]
- Updated dependencies [206bec5]
- Updated dependencies [f9b3922]
- Updated dependencies [e840865]
- Updated dependencies [692ac5a]
- Updated dependencies [815b791]
- Updated dependencies [6dca6fc]
- Updated dependencies [9b9c9db]
- Updated dependencies [33d464d]
- Updated dependencies [cc12678]
  - @ultimabase/core@1.0.0
  - @ultimabase/plugin-kit@0.1.0
  - @ultimabase/shared@1.0.0
