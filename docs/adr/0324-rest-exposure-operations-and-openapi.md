# ADR-0324: REST exposure, application operations and OpenAPI

- Status: accepted
- Date: 2026-10-12
- Refines: the REST plugin records, ADR-0294 (`publicWrites`), ADR-0305 (client errors),
  ADR-0309 (cursor pagination), ADR-0316 (`definePlugin`, `.with` rules, temporary command
  bindings), ADR-0319 (validation issues), ADR-0323 (HTTP foundation); applies ADR-0288
- Approval: decisions of the REST review (`docs/handoff/revue-plugins/rest.md`, decisions 1 to
  13, validated by the user on 2026-10-09) and Validation review decision 13; record accepted by the user on 2026-10-12

- Already implemented elsewhere: shared pagination and cursor (ADR-0309), body limit inherited
  from HTTP (ADR-0323)

## Context

REST mounts under `/api/v1`, where `v1` is UltimaBase's REST protocol version but reads as the
application's API version. Its schema option uses its own keys (`upsert`, `mutations`), plugin
commands are bound by a temporary automatic rule from migration 6.0, plugin operations are listed
again in every transport, `acknowledgeUnverifiedProtection` still exists although ADR-0294
replaced it, errors carry little detail, a disabled method answers 404, custom operations need a
plugin, and there is no machine-readable description of the API.

## Decision

1. **`/api` without a version.** The default base path is `/api` (`/api/classes/Todo`,
   `/api/auth/login`); `basePath` is free (`/api/v1` remains possible for an application that
   versions its own API). The REST protocol version travels in the response header
   `X-UltimaBase-Rest-Version`; a future format would be chosen by an option, not by the URL. The
   health route stays at `/health` (ADR-0323).
2. **One vocabulary.** The keys of the `.with({ rest: { … } })` rule are the schema method names
   (`findMany`, `count`, `createOne`, `upsertOne`, `deleteOne`, plugin commands such as
   `softDeleteOne`…), the same keys as `graphql` and Access rules; the rule leaves the projection
   templates. Plugin commands are exposed only through these keys: the temporary automatic
   binding of migration 6.0 is removed.
3. **`publicWrites`.** `acknowledgeUnverifiedProtection` is removed; REST applies ADR-0294: it
   refuses to start when it would expose writes without an installed protected policy, unless
   `restPlugin({ publicWrites: true })`.
4. **Errors.** Client errors carry `details: { parameter, path, reason }`; a method disabled for a
   schema answers 405 instead of 404.
5. **Operations exposed by their owner (F1).** A plugin declares which of its operations are
   meant to be public (for example `signUp`, `login`); every installed transport exposes them;
   the application can hide some (`restPlugin({ hide: [authOperations.refresh] })`); an operation
   not declared public is never exposed. The per-transport operation lists are removed.
6. **Application operations.** `defineOperation({ name, input, output, handler })` with Standard
   Schema validators declares an application operation without writing a plugin; it is exposed
   like a public plugin operation (`POST /api/operations/<name>`) and REST derives its request and
   response formats from the validators.
7. **OpenAPI.** `restPlugin({ openapi: true })` serves `/api/openapi.json`: exposed routes,
   fields, types and the validation constraints that validators can describe; no access rule is
   revealed.
8. **Kept.** Routes `/classes/{Schema}`, responses `{ results }` / `{ result }`, field codecs,
   `basePath`, `instanceId`, `where` as JSON as the only filter form (documented).

## Consequences

- Clients and examples move from `/api/v1` to `/api`; create-app, the website and READMEs
  follow. GraphQL shares decisions 2, 3 and 5 in its own record.
- Tests: base path and header, `.with({ rest })` keys including plugin commands and the removed
  automatic binding, `publicWrites` refusal and opt-in, detailed errors and 405, F1 exposure and
  `hide`, `defineOperation` round trip with validation issues, OpenAPI document content and
  validity, unchanged routes; DX audit and form D bench (expected gain: REST leaves the
  templates).
- Documentation impact: both (REST page and README, operations guide, create-app).

## Out of scope

A typed client without generation (`createClient<typeof ultimabase>`), multi-schema `/batch`,
schema commands taking input data.
