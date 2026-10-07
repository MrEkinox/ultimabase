# Product specification

## Goal

UltimaBase is a modern, strongly typed backend framework with Parse-like simplicity and without Parse compatibility constraints.

Static TypeScript schemas generate or drive:

- PostgreSQL structures;
- validation and inferred types;
- full CRUD, bulk operations, and upserts;
- optional official schema and field Access, independent object ACL, and roles;
- REST and GraphQL APIs;
- migrations and synchronization;
- SDK and realtime metadata in later milestones.

## First release scope

The first release scope includes:

- primitive fields: string, integer/float number, boolean, date, enum, JSON, and array;
- UUID v7 identifiers plus `createdAt` and `updatedAt`;
- `create`/`createOne`, `update`/`updateOne`, `upsert`/`upsertOne`, and `delete`/`deleteOne` for singular mutations, explicit `*Many` collection terminals, plus `find`, `first`, `get`, `count`, and `exists`;
- schema-aware nested pointer and relation commands inside singular create and
  update data, executed as one bounded atomic graph;
- immutable Query classes and cursor pagination;
- PostgreSQL through Drizzle internally;
- direct schema synchronization and an optional PostgreSQL migration plugin;
- an optional Fetch-compatible HTTP application plugin with one required public
  application ID, explicit cross-origin browser policy, and Hono as the first
  server provider;
- generated REST;
- local username/password authentication with opaque Bearer sessions and an
  optional secure-cookie transport;
- generated GraphQL through Yoga;
- custom `GraphQLSchema` merging;
- automatic mutation transactions, optional official typed schema and field
  Hooks, deterministic plugin contributions, and post-commit events;
- parallel Vitest integration tests through Testcontainers.

## Naming and data conventions

- npm scope: `@ultimabase/*`.
- PostgreSQL table names: plural `snake_case`.
- object identifiers: UUID v7 generated before insertion.
- `id`, `createdAt`, and `updatedAt` are reserved system fields.
- server values use `Date`; transports serialize ISO 8601 strings.
- omitted and `null` are distinct: fields are optional and non-null by default.
- a field cannot be both required and nullable.

## Public objects

Classes are preferred for discoverable public domain objects and immutable builders:

- `Query`;
- `ACL`;
- `Role`;
- framework errors;
- application and engine objects.

Factories, plugin definitions, hooks, scopes, and rule combinators remain functions.

## Optional official lifecycle Hooks

`@ultimabase/hooks-plugin` owns the official business lifecycle. When installed,
a schema may declare operation-family Hooks without repeating singular and bulk
handlers, and a field may declare Hooks that infer its exact logical value.
Compatible plugins contribute global, schema, typed field-path, extension, or
field-kind behavior through its public contracts. Without it, Core exposes no
official Hook option or dispatcher.

The official Access plugin and independent protected-policy plugins compose
separately from business Hooks: guards only deny, database constraints only
accumulate, and field restrictions only narrow. Applications without either
kind of policy execute no placeholder permission behavior.

Every mutation and every database write started by its business hooks shares an
automatic transaction. Business after-hooks may still abort before commit;
external side effects run after commit or through an outbox. Reads remain
non-transactional unless the developer explicitly opens a transaction.

## Access semantics

- `anonymous` and `master` are Core's only authority modes; authentication adds typed request context without adding another Core mode.
- official schema Access controls whole-schema operations, row filters, and item decisions when `accessPlugin()` is installed.
- ACL applies to individual objects through Core's generic protected-policy boundary and never broadens another policy.
- official field Access controls output, `where`, `orderBy`, create input, and fill, replace, clear, or relation-write transitions.
- roles may contain members and other roles without granting an operation by installation alone.
- master is trusted authority and is audited. An explicitly configured HTTP
  boundary may verify the selected application's raw Master key before Core
  creates application-owned provenance; request structure alone never creates
  authority.

## Compatibility

UltimaBase targets Node.js 24+, ESM, and TypeScript strict mode. Packages begin at `0.x`; compatibility is not promised before `1.0`, but changes must still be documented through Changesets.
