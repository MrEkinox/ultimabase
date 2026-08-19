# 1604: Infer public plugin instance types

- Status: planned
- Milestone: 16
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`, official plugins
- Depends on: 1509

## Goal

Remove handwritten `FrameworkPlugin<...>` generic tuples from ordinary plugin
packages while preserving the exact manifest, exports, dependencies, privileges,
capabilities, instance identity, and lifecycle types inferred by consumers.

## Acceptance criteria

- [ ] Audit whether native TypeScript inference, `ReturnType`, `satisfies`, or one small public utility is the smallest stable solution before adding a helper.
- [ ] Plugin factories publish a named instance type without restating privilege and capability tuples already present in their implementation.
- [ ] Exact literal plugin ID, instance ID, version, Core range, setup exports, dependencies, optional dependencies, conflicts, privileges, claims, nested plugins, and capability declarations survive source and emitted declarations.
- [ ] Migrate PostgreSQL, roles, ACL, ACL/PostgreSQL, pg-vector, Hooks, and Access plugin types where applicable without widening their public contracts.
- [ ] Hover output remains understandable and does not expose large internal conditional types as the primary authoring experience.
- [ ] No runtime helper, registry, metadata copy, or package dependency is introduced solely for a type alias.

## Tests

- [ ] Type and language-service tests compare inferred official plugin contracts with their exact expected facts through source and packed exports.
- [ ] Public API tests confirm removal of superseded handwritten aliases or preservation of their canonical inferred replacement names.

## Out of scope

- Hiding manifest facts or weakening literal inference to shorten declarations.
- Generating plugin source code.
- Changing runtime plugin identity or instance composition.
