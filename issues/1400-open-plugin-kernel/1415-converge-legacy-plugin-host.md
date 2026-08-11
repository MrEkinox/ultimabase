# 1415: Converge legacy services, slots, and setup registries

- Status: planned
- Milestone: 14
- Packages: `@ultimabase/core`, official plugins
- Depends on: 1404
- ADR: ADR-0043, ADR-0044, ADR-0046, ADR-0048, ADR-0049, ADR-0190, ADR-0191

## Goal

Make the versioned capability host the only public cross-plugin extension path
before static schema and Runtime integrations build on it.

## Acceptance criteria

- [ ] Plugin definitions support stable plugin IDs, semantic versions, explicit instance IDs, versioned named dependencies, and exact-instance dependencies without ambiguous string keys.
- [ ] Declaration capabilities expose immutable facts before compilation; application capabilities materialize resource-backed implementations during setup and dispose them through the owning application lifecycle.
- [ ] Every current exclusive string slot migrates to one canonical `single` capability and the public `slot` option is removed.
- [ ] Public plugin-to-plugin services migrate to application capabilities; plugins no longer receive a general `PluginServiceRegistry` or unrestricted service lookup.
- [ ] Extensions, operators, hooks, generators, transports, pipelines, events, commands, Access, and constraint compilers migrate to typed capabilities or privilege-scoped hosts.
- [ ] The generic `PluginContributionRegistries`, category strings, and public `registries` setup escape hatch are removed.
- [ ] Lifecycle phase order, nested parent and child behavior, partial-failure cleanup, reverse disposal, setup exports, and application isolation remain unchanged.
- [ ] Temporary migration bridges enforce owner, instance, requirement, and privilege checks and are deleted in the same issue.
- [ ] Core or application-injected resources retain only the narrow private storage needed for materialization and native explicit-resource disposal.
- [ ] Package READMEs and migration notes map every removed slot, service token, and registry category to its canonical capability replacement.

## Tests

- [ ] Runtime tests cover two explicit instances, duplicate identities, versioned dependencies, both capability lifetimes, disposal, lifecycle failure, and nested composition.
- [ ] Removal tests and repository searches prove no public generic registry, plugin service bypass, or string slot remains.
- [ ] Type, language-service, packed, dependency, and official-plugin tests prove all replacements use public capabilities without `any` or deep imports.

## Out of scope

- Static schema transformation semantics; issues 1405 and 1406 own them.
- Hot reload or post-compilation provider replacement.
