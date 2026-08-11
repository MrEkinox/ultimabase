# 1415: Converge legacy services, slots, and setup registries

- Status: completed
- Milestone: 14
- Packages: `@ultimabase/core`, official plugins
- Depends on: 1404
- ADR: ADR-0043, ADR-0044, ADR-0046, ADR-0048, ADR-0049, ADR-0190, ADR-0191, ADR-0195

## Goal

Make the versioned capability host the only public cross-plugin extension path
before static schema and Runtime integrations build on it.

## Approved convergence interpretation

This issue removes the generic legacy paths without anticipating static schema
compilation or the milestone-15 extraction of native Hooks and Access:

- exclusive slots, public plugin services, and command-style cross-plugin
  contracts migrate to canonical versioned capabilities;
- application capability factories receive the compiled schema registry as a
  read-only application view after schema compilation and before plugin setup;
- native Hooks, Access, events, Runtime pipelines, and database constraint
  compilers retain only exact Core-owned privilege-scoped facades and private
  application storage needed to preserve current behavior;
- application factories may read the live owner-attributed constraint compiler
  view only when their owner has active `adapter:consume` authority;
- capability requirements default to provider-first materialization ordering;
  peer plugins may explicitly use setup-phase requirements when their resources
  are independently materializable and only consume each other during setup;
- legacy extension claims are removed because the compiled schema graph already
  owns extension truth and provenance;
- unused generic operator, generator, and transport categories are deleted
  without replacement;
- no new Core-specific Hooks or Access extension path is introduced.

Package migration notes map every removed surface either to its canonical
capability, its exact Core-owned facade, or deliberate removal when no current
consumer exists.

## Migration map

- `slot` -> canonical `single` capabilities with explicit provider conflicts.
- `ServiceToken`, `ServiceRegistry`, setup `services`, and application service
  lookup -> declaration or application capabilities; developer-facing values
  use typed plugin setup exports.
- database adapter, Access principal and role resolvers, hook diagnostics,
  PostgreSQL connection, and Typegen emitter services -> their canonical
  application capabilities.
- PostgreSQL schema-preparation claim ->
  `postgresSchemaPreparationCapability`.
- generic `commands` -> domain capabilities; Access reference cleanup now uses
  `accessReferenceCleanupCapability`.
- native `hooks` and `access` categories -> exact `hooks` and `access` setup
  facades guarded by `runtime:intercept` and `runtime:constrain`.
- low-level Runtime hooks and policy definitions -> exact `runtime` facade;
  named and post-commit consumers -> `events`; fixed stages -> `pipeline`.
- database constraint compilers -> exact `constraintCompilers` facade guarded
  by `adapter:consume`, with a read-only live factory view for authorized
  application capability materialization.
- extension claims -> removed; compiled schema extensions already retain owner
  provenance and application initialization validates installed owners.
- unused operators, generators, and transports -> removed without replacement.
- public `ContributionRegistry`, `PluginSetupRegistries`, lifecycle internals,
  generic contribution snapshots, and generic application lookup -> removed;
  exact backing stores remain private to Core.

## Acceptance criteria

- [x] Plugin definitions support stable plugin IDs, semantic versions, explicit instance IDs, versioned named dependencies, and exact-instance dependencies without ambiguous string keys.
- [x] Declaration capabilities expose immutable facts before compilation; application capabilities materialize resource-backed implementations during setup and dispose them through the owning application lifecycle.
- [x] Every current exclusive string slot migrates to one canonical `single` capability and the public `slot` option is removed.
- [x] Public plugin-to-plugin services migrate to application capabilities; plugins no longer receive a general `PluginServiceRegistry` or unrestricted service lookup.
- [x] Extensions, operators, hooks, generators, transports, pipelines, events, commands, Access, and constraint compilers migrate to typed capabilities or privilege-scoped hosts.
- [x] The generic `PluginContributionRegistries`, category strings, and public `registries` setup escape hatch are removed.
- [x] Lifecycle phase order, nested parent and child behavior, partial-failure cleanup, reverse disposal, setup exports, and application isolation remain unchanged.
- [x] Temporary migration bridges enforce owner, instance, requirement, and privilege checks and are deleted in the same issue.
- [x] Core or application-injected resources retain only the narrow private storage needed for materialization and native explicit-resource disposal.
- [x] Package READMEs and migration notes map every removed slot, service token, and registry category to its canonical capability replacement.

## Tests

- [x] Runtime tests cover two explicit instances, duplicate identities, versioned dependencies, both capability lifetimes, disposal, lifecycle failure, and nested composition.
- [x] Removal tests and repository searches prove no public generic registry, plugin service bypass, or string slot remains.
- [x] Type, language-service, packed, dependency, and official-plugin tests prove all replacements use public capabilities without `any` or deep imports.

## Out of scope

- Static schema transformation semantics; issues 1405 and 1406 own them.
- Hot reload or post-compilation provider replacement.
