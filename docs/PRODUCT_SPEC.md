# Product specification

## Goal

UltimaBase is a modern, strongly typed backend framework with Parse-like simplicity and without Parse compatibility constraints.

Static TypeScript schemas generate or drive:

- PostgreSQL structures;
- validation and inferred types;
- full CRUD, bulk operations, and upserts;
- CLP, object ACL, roles, and field access;
- REST and GraphQL APIs;
- migrations and synchronization;
- SDK and realtime metadata in later milestones.

## First release scope

The first complete vertical includes:

- primitive fields: string, integer/float number, boolean, date, enum, JSON, and array;
- UUID v7 identifiers plus `createdAt` and `updatedAt`;
- `createOne`, `createMany`, `find`, `first`, `get`, `count`, `exists`, `updateOne`, `updateMany`, `upsertOne`, `upsertMany`, `deleteOne`, and `deleteMany`;
- immutable Query classes and cursor pagination;
- PostgreSQL through Drizzle internally;
- direct schema synchronization and an optional PostgreSQL migration plugin;
- generated REST;
- generated GraphQL through Yoga;
- custom `GraphQLSchema` merging;
- automatic mutation transactions, native typed schema and field hooks,
  deterministic plugin hook contributions, and post-commit events;
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
- `BoundQuery`;
- `ACL`;
- `Role`;
- framework errors;
- application and engine objects.

Factories, plugin definitions, hooks, scopes, and rule combinators remain functions.

## Native lifecycle hooks

Business hooks are a framework primitive and require no plugin. A schema may
declare operation-family hooks without repeating singular and bulk handlers,
and a field may declare hooks that infer its exact logical value. Plugins append
global, schema, typed field-path, extension, or field-kind hooks through the
same application-owned dispatcher.

CLP, ACL, and field permissions use that dispatcher rather than named Runtime
stages. Their generic hook effects are monotonic: guards only deny, database
constraints only accumulate, and field restrictions only narrow. Applications
that omit those plugins do not execute placeholder permission behavior.

Every mutation and every database write started by its business hooks shares an
automatic transaction. Business after-hooks may still abort before commit;
external side effects run after commit or through an outbox. Reads remain
non-transactional unless the developer explicitly opens a transaction.

## Access semantics

- `anonymous`, `user`, and `master` are the only access modes.
- CLP applies to whole-schema operations.
- ACL applies to individual objects and never overrides CLP.
- field access controls selection, create input, and update input.
- roles may contain users and other roles.
- master is trusted server-side authority and is audited.

## Compatibility

UltimaBase targets Node.js 24+, ESM, and TypeScript strict mode. Packages begin at `0.x`; compatibility is not promised before `1.0`, but changes must still be documented through Changesets.
