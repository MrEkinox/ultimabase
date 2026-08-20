# 1504: Move Access authoring and plans into access-plugin

- Status: planned
- Milestone: 15
- Packages: `@ultimabase/access-plugin`, `@ultimabase/core`, `@ultimabase/typegen`, `@ultimabase/plugin-kit`
- Depends on: 1503
- ADR: ADR-0167 through ADR-0171, ADR-0189, ADR-0194, ADR-0204

## Goal

Create the official Access plugin and move schema and field policy authoring plus
compiled Access plans out of Core's native product surface.

## Acceptance criteria

- [ ] Create one complete `@ultimabase/access-plugin`; it owns its public contracts, importing it installs no behavior, and configuring its exported definition enables the official engine.
- [ ] The plugin owns schema and field `access` option namespaces, decisions, combinators, filters, targets, defaults, provider contracts, and `AccessPlan` compilation.
- [ ] Installing the plugin restores the accepted operation, filter, item, and field Access DX through public declarations and Typegen.
- [ ] Omitting the plugin removes Access options and plan compilation without removing Core master authority.
- [ ] Official-compatible Access providers import the plugin's public contracts and declare a non-ordering peer; independent alternative engines own their protocols and use only the generic public kernel.
- [ ] The package uses only public Core and plugin-kit contracts and declares exact privileges.

## Tests

- [ ] Runtime declaration, type, language-service, filter, plan, provider, source, packed, and application-isolation tests preserve exact current contracts.
- [ ] Negative tests prove Core alone exposes no Access product vocabulary after the migration boundary is active.

## Out of scope

- Runtime enforcement; issue 1505 owns execution.
- Migrating ACL and Roles providers; issue 1506 owns them.
