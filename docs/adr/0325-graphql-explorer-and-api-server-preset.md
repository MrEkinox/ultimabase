# ADR-0325: GraphQL options, one explorer plugin and the `api-server` preset

- Status: accepted
- Date: 2026-10-12
- Refines: the GraphQL, Yoga and explorer plugin records, ADR-0294 (`publicWrites`), ADR-0301
  (decision 5, deferred for GraphQL at migration step 1), ADR-0303 (`ultimabase.health()`),
  ADR-0304 (`execute({ principal })`), ADR-0309 (shared pagination), ADR-0312 (environment
  defaults), ADR-0316 (`.with` rules, temporary command bindings), ADR-0324 (shared transport
  decisions); applies ADR-0288
- Approval: decisions of the GraphQL, Yoga, explorer and `api-server` reviews
  (`docs/handoff/revue-plugins/graphql.md`, `graphql-yoga.md`, `graphql-explorers.md`,
  `api-server.md`, validated by the user on 2026-10-09); record accepted by the user on 2026-10-12
- Already implemented elsewhere: Yoga introspection by environment and the explorer's
  introspection requirement (ADR-0312), shared pagination and nested `after` (ADR-0309),
  `execute({ principal })` (ADR-0304)

## Context

GraphQL's schema option has its own shape and keys, plugin commands are bound by the temporary
rule of migration 6.0, a disabled feature fails without a hint, connections have no `totalCount`,
startup fails when no schema is exposed, filter inputs still list operators the database adapter
does not declare (ADR-0301 decision 5, deferred), virtual fields on included rows resolve one row
at a time, and no SDL file is written for client tooling. Two explorer packages duplicate about
290 lines, and launching REST and GraphQL needs seven packages declared one by one.

## Decision

**GraphQL (`@ultimabase/graphql-plugin`).**

1. **Flat rule, shared keys.** `.with({ graphql: { count: true, typeName: 'Task' } })` uses the
   schema method names as keys, like REST (ADR-0324 decision 2), and leaves the projection
   templates; plugin commands are exposed only through these keys (the automatic binding of 6.0 is
   removed). `publicWrites` and owner-declared public operations (F1) apply as in ADR-0324.
2. **Health field.** A root `health` field, always present, answers `OK` or `DEGRADED` from
   `ultimabase.health()`; a GraphQL API without exposed schema starts with a warning instead of
   failing.
3. **Hints.** A validation error on a disabled feature names how to enable it
   (`hint: enable graphql: { count: true } on Todo`).
4. **`totalCount`** in connections, computed only when selected and when `count` is allowed for
   the schema.
5. **Declared operators only.** Filter input types list only the operators the database adapter
   declares, completing ADR-0301 decision 5 (static operator declaration readable when the
   GraphQL schema is compiled).
6. **Batched virtual fields.** A virtual field may declare `resolveMany(rows)`; included targets
   resolve per parent in parallel; tests pin the query count of reads with `include`;
   documentation warns that per-row reads in application loops stay N+1.
7. **SDL file.** `graphqlPlugin({ sdl: './schema.graphql' })` writes the SDL at startup for
   graphql-codegen or gql.tada.

**Explorer.**

8. **One plugin.** `graphqlExplorerPlugin({ ui: 'graphiql' | 'apollo-sandbox' })` (GraphiQL by
   default) replaces `@ultimabase/graphiql-plugin` and `@ultimabase/apollo-sandbox-plugin`; its
   URL is `/graphiql` or `/apollo-sandbox`, prefixed by `/__ultimabase/apps/{appId}` only with
   several applications; GraphiQL scripts get integrity hashes in the import map; Apollo Sandbox's
   unpinned script is a documented risk, limited by serving it in development only.
   `@ultimabase/graphql-http` stays as the neutral contract.

**Preset.**

9. **`@ultimabase/api-server`.** `apiServer({ rest, graphql, http, server })` returns the list
   `[httpPlugin(), restPlugin(), graphqlPlugin(), graphqlYogaPlugin(), honoServerPlugin()]` (and
   `graphqlExplorerPlugin()` with `graphql: { explorer }`, outside production) according to its
   options, forwarding each option object; it hides no code, every plugin stays installable alone,
   and no plugin depends on another because of the preset.

## Consequences

- create-app and the examples use `apiServer(...)`; the two explorer packages are removed.
- Tests: `.with({ graphql })` keys and the removed binding, `publicWrites`, F1 operations, health
  field and the no-schema warning, hints, `totalCount` and its rule, inputs without undeclared
  operators through a fake adapter, `resolveMany` and query counts, SDL file, explorer UIs, URLs,
  integrity hashes and production behaviour, preset composition and option forwarding; DX audit
  and form D bench (expected gain: GraphQL leaves the templates, the last plugin to do so).
- Documentation impact: both (GraphQL, Yoga and explorer pages and READMEs, preset, create-app).

## Out of scope

Subscriptions (future Realtime plugin), persisted queries, `GET` queries, file uploads, offline
explorer assets.
