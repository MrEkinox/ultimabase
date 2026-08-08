# Product specification

## Goal

UltimaBase is a modern, strongly typed backend framework with Parse-like simplicity and without Parse compatibility constraints.

Static TypeScript schemas generate or drive:

- PostgreSQL structures;
- validation and inferred types;
- full CRUD, bulk operations, and upserts;
- native schema and field Access, object ACL, and roles;
- REST and GraphQL APIs;
- migrations and synchronization;
- SDK and realtime metadata in later milestones.

## First release scope

The first complete vertical includes:

- primitive fields: string, integer/float number, boolean, date, enum, JSON, and array;
- UUID v7 identifiers plus `createdAt` and `updatedAt`;
- `create`/`createOne`, `update`/`updateOne`, `upsert`/`upsertOne`, and `delete`/`deleteOne` for singular mutations, explicit `*Many` collection terminals, plus `find`, `first`, `get`, `count`, and `exists`;
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

Native Access declarations and ACL provider contributions compile separately
from business hooks into one monotonic plan: guards only deny, database
constraints only accumulate, and field restrictions only narrow. Applications
without Access declarations or providers do not execute placeholder permission
behavior.

Every mutation and every database write started by its business hooks shares an
automatic transaction. Business after-hooks may still abort before commit;
external side effects run after commit or through an outbox. Reads remain
non-transactional unless the developer explicitly opens a transaction.

## Access semantics

- `anonymous` and `master` are Core's only authority modes; authentication adds typed request context without adding another Core mode.
- native schema Access controls whole-schema operations, row filters, and item decisions.
- ACL applies to individual objects and never overrides native Access.
- native field Access controls output, `where`, `orderBy`, create input, and fill, replace, clear, or relation-write transitions.
- roles may contain members and other roles without granting an operation by installation alone.
- master is trusted server-side authority and is audited.

## Compatibility

UltimaBase targets Node.js 24+, ESM, and TypeScript strict mode. Packages begin at `0.x`; compatibility is not promised before `1.0`, but changes must still be documented through Changesets.
