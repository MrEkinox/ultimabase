# ADR-0316: `definePlugin` and higher-kinded projection slots

- Status: proposed
- Date: 2026-10-11
- Refines: ADR-0297 (form D shape methods and `.with`), ADR-0311 (plugin-author entry), ADR-0200
  (plugin schema mutations); applies ADR-0288 and ADR-0289
- Approval: direction decided by the user on 2026-10-11 after the 6.0 spike (points 1 to 7 of
  the coordinator's recommendation); record to be accepted by the user
- Evidence: `docs/handoff/spike-definePlugin.md` (branch `spike/plugin-facade`, base `main`
  73109860), `docs/handoff/migration-core-etape-5.md` (lever 3), `docs/handoff/simplification.md`
  (facade mandate), `docs/handoff/revue-plugins/soft-delete.md`

## Context

Writing a plugin needs many identifiers and hand-written type templates: Soft Delete is 362
lines and 25 imported names, a plugin adding one option 52 lines and 6 names, an HTTP route 22
lines and 3 names. Plugins add fields, static commands and options to schemas through
projection templates (`schemaFields`, `schemaClass`, `schemaOptions`) that Core resolves with
`ResolveSourceSchemaTemplate`; step 5 found them to be the largest remaining type cost. The
spike replaced them with higher-kinded slots on the real Core and measured edit→diagnostics on
the form D benchmark: 2.05 → 1.72 s at 50 schemas (−16 %) and 6.96 → 5.43 s at 200 (−22 %),
2.33 M → 1.74 M instantiations at 50. On a prototype `definePlugin`, the four probe plugins took
42, 16, 23 and 9 lines with 5, 1, 4 and 2 imported names.

## Decision

1. **Projection slots.** Plugins contribute to schema types only through higher-kinded slots
   evaluated by Core: `SchemaFieldsHKT` (input: the called shape methods and their arguments;
   output: added fields, never reading the schema), `SchemaStaticsHKT` (input: shape and the
   configured schema; output: static members), and the existing `SchemaRulesHKT`, which also
   takes over `schemaOptions` (plugin options of a schema are `.with({ … })` entries). Core
   exports `SchemaCommands<TSchema, TCommands>` to type static commands. Shape methods are
   generic over their arguments and the declaration chain records them. In form D, `define`
   takes no plugin option. The template slots and their resolvers
   (`PluginSourceSchemaProjection`, `ResolvePluginSchemaProjection`, `ResolveSourceSchemaTemplate`,
   `PluginSourceMutationMethod`, `PluginSourceSchemaFieldValues`, `PluginSchemaPatchSource`,
   `PluginModelSurfaceSource`, the schema part of `PluginSchemaOptionSource`,
   `ConfiguredSchemaSelectorOptions`, `ConfiguredProjectionOptions`) are removed once no plugin
   uses them; field options keep their own mechanism.
2. **`definePlugin` in `@ultimabase/plugin-kit`**, built only on Core's public plugin-author
   entry: `definePlugin({ name, version?, shape?, rules?, afterCommit?, contributions? })` with
   `shapeMethod({ options?, fields?, commands? })` and
   `command({ authority: 'request' | 'master', effect: 'update' | 'delete', data? })`. It
   generates the selectors, patches, forbidden-input fields, contribution identifiers, schema
   mutations, runtime behaviour and privilege declarations; authors write none of them. Raw
   `plugin()` stays for plugins whose rules or commands depend on the schema (Access, Hooks,
   ACL). A transport's contributions come from a helper of that transport plugin, starting
   with `httpRoutes({ 'GET /health': handler })` in `@ultimabase/http-plugin`.
3. **No forced re-typing.** Core's `plugin()` accepts an explicit static `source` type
   parameter, so `definePlugin` types its result without a cast.
4. **Plugin-author names leave the main entry.** The plugin-authoring exports of
   `@ultimabase/core` (163 names, 29 values, inventoried by the spike) move to
   `@ultimabase/core/plugin`; the main entry keeps what applications use.
5. **Rule values at Runtime.** Core exposes a public, documented accessor for a schema's
   `.with({ … })` values to the plugin that declared the rule, replacing reads of the
   undocumented definition object.
6. **Many-row plugin commands.** A plugin schema mutation may target the rows matching a
   `where` (with the same Access, hooks, transaction and readable-result rules as its one-row
   form, ADR-0306), so that `…Many` commands need no plugin-side query.
7. **Soft Delete is the proving plugin** and is migrated entirely in this step, per its review:
   `.softDelete()` and `.softDelete({ mode: 'command' })`; the same commands in both modes
   (`softDeleteOne`/`Many`, `restoreOne`/`Many`, `purgeOne`/`Many`; in the default mode
   `deleteOne` is also logical); `deletedAt` stamped by the server and cleared by restore;
   `defaultMode` and `instanceId` removed; restore-conflict message and partial-index example of
   the review. Its `readDeleted` rule waits for the Access extension point (6.1).

## Consequences

- Plugins still on templates (ACL `acl`, PostgreSQL `postgres`, REST `rest`, GraphQL `graphql`)
  move their schema option to a `.with` rule in their own sub-steps; their old-form tests and
  examples move to form D at the same time.
- Tests: slot evaluation (fields from shape arguments, statics with commands, rules), generic
  shape methods without cycles on TypeScript 6 and 7 compile tests, `definePlugin` for the four
  probe plugins (runtime against PostgreSQL and types), `httpRoutes`, the rule accessor, many-row
  commands with Access, hooks and rollback, Soft Delete per its review; DX audit of every removed
  and moved name; form D bench before and after.
- Hovers: `.softDelete` grows from 607 to about 680 characters (generic signature); command
  hovers are unchanged.
- Documentation impact: both (plugin authoring guide on the website, plugin-kit, Core, Soft
  Delete and HTTP READMEs).

## Out of scope

Commands with input data (with the transports, 6.6), Core applying plugin fields itself,
schema-dependent fields, the `readDeleted` Access rule (6.1), ADR-0297's speed targets (revised
after 6.8).
