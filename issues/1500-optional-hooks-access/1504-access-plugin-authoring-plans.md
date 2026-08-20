# 1504: Extract the complete Access plugin

- Status: planned
- Milestone: 15
- Packages: `@ultimabase/access-plugin`, `@ultimabase/core`, `@ultimabase/typegen`, `@ultimabase/plugin-kit`, `@ultimabase/postgres-plugin`, `@ultimabase/testing`
- Depends on: 1503
- ADR: ADR-0117, ADR-0128, ADR-0167 through ADR-0171, ADR-0189, ADR-0194, ADR-0204

## Goal

Create the official Access plugin and move schema and field policy authoring plus
compiled plans and Runtime enforcement out of Core's native product surface as
one atomic extraction.

## Acceptance criteria

- [ ] Create one complete `@ultimabase/access-plugin`; it owns its public contracts, importing it installs no behavior, and configuring its exported definition enables the official engine.
- [ ] The plugin owns schema and field `access` option namespaces, decisions, combinators, filters, targets, defaults, provider contracts, and `AccessPlan` compilation.
- [ ] Installing the plugin restores the accepted operation, filter, item, and field Access DX through public declarations and Typegen.
- [ ] Omitting the plugin removes Access options and plan compilation without removing Core master authority.
- [ ] Official-compatible Access providers import the plugin's public contracts and declare a non-ordering peer; independent alternative engines own their protocols and use only the generic public kernel.
- [ ] The package uses only public Core and plugin-kit contracts and declares exact privileges.
- [ ] Access plugin evaluates operation, filter, item, and field decisions through public Runtime capabilities with no private Core assembly branch.
- [ ] Denials remain irreversible, row predicates and opaque constraints accumulate with logical `AND`, and field restrictions intersect before final output.
- [ ] Initial evaluation, target preparation, value-dependent reevaluation, relationship recursion, and final restriction retain current order and fail-closed behavior.
- [ ] Rewritten persistence plans carry the logical target's protected restrictions into the actual adapter statement.
- [ ] Master remains a Core authority observed through the existing audited request context; the plugin explicitly declares bypass or enforcement behavior without creating Master.
- [ ] No-Access applications allocate no plan, provider snapshot, placeholder handler, or Access-specific request state.

## Tests

- [ ] Runtime declaration, type, language-service, filter, plan, provider, source, packed, and application-isolation tests preserve exact current contracts.
- [ ] Negative tests prove Core alone exposes no Access product vocabulary after the migration boundary is active.
- [ ] Existing Access and enforcement suites migrate or adapt through public plugin APIs and retain focused coverage.
- [ ] PostgreSQL E2E covers reads, counts, relations, itemized mutations, field transitions, master, persistence rewrites, and application isolation.

## Out of scope

- Migrating ACL and Roles providers; issue 1506 owns them.
- New Access policy semantics or provider types.
- Final Core removal audit; issue 1508 owns it.
