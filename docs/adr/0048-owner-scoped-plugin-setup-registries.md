# ADR-0048: Owner-scoped plugin setup registries

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0003, ADR-0044

## Decision

Every application owns one `PluginSetupRegistries` instance containing its
schema and service registries plus named contribution registries for
extensions, operators, hooks, generators, transports, pipelines, events, and
commands. No registry uses global mutable state.

`forPlugin(pluginName)` creates a stable immutable setup context. Its service
and contribution views bind every write to that plugin name, so plugin code
cannot choose or forge contribution ownership. Application-provided services
remain supported without a plugin owner. Service lookup keeps nominal token
typing, while `ownerOf(token)` exposes recorded plugin ownership when present.

Named contribution categories share `ContributionRegistry`. A contribution
record preserves its name, owning plugin, and exact runtime value identity.
Names are unique inside one category; a second owner fails with
`PLUGIN_CONFLICT` and never replaces the original contribution. Read methods
return immutable contribution and list snapshots.

Setup registries collect declarations only. Infrastructure connection and
transport startup belong to later lifecycle phases. After all plugin setup
callbacks finish, Core can inspect extension contributions and report schema
metadata that no installed plugin claimed.

## Consequences

Several applications can run concurrently without sharing services, handlers,
hooks, or transport declarations. Diagnostics can attribute every plugin
contribution to its owner without requiring plugin authors to repeat their own
name.

Future packages may add typed facades over a contribution category while
retaining the same application-owned storage and ownership invariant.
