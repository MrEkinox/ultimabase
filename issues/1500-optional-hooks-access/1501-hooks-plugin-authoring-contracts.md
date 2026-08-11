# 1501: Move hook authoring contracts into hooks-plugin

- Status: planned
- Milestone: 15
- Packages: `@ultimabase/hooks-contracts`, `@ultimabase/hooks-plugin`, `@ultimabase/core`, `@ultimabase/typegen`, `@ultimabase/plugin-kit`
- Depends on: 1414
- ADR: ADR-0189, ADR-0194

## Goal

Create the official Hooks plugin and move schema, field, plugin-target, callback,
and Typegen authoring contracts out of Core's native product surface.

## Acceptance criteria

- [ ] Create dependency-light `@ultimabase/hooks-contracts` and the complete first `@ultimabase/hooks-plugin` implementation together; importing contracts installs no behavior.
- [ ] The plugin owns schema and field `hooks` option namespaces, callback contracts, target selectors, phase families, and exact Typegen declarations.
- [ ] Installing the plugin restores the accepted compact Hooks DX through public static declarations.
- [ ] Omitting the plugin leaves hook options absent from generated autocomplete and fails declared hook metadata with an owner-aware missing capability diagnostic.
- [ ] The plugin and community alternatives share hooks-contracts tokens; Core does not import that package and the official plugin uses only public Core and plugin-kit contracts.
- [ ] Core retains only generic middleware, transaction, cancellation, event, and context primitives needed by other engines.

## Tests

- [ ] Runtime declaration, type, language-service, source, packed, and application-isolation tests preserve exact hook inference and ownership.
- [ ] Negative tests prove Core alone exposes no Hooks authoring vocabulary after the migration boundary is active.

## Out of scope

- Hook execution; issue 1502 owns the dispatcher and lifecycle.
- Access or policy behavior.
