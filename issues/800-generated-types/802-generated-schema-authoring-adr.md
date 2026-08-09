# 802: Decide generated schema authoring architecture

- Status: planned
- Milestone: 8
- Packages: documentation
- Depends on: 801
- ADR: new ADR required

## Goal

Turn the validated prototype into one durable decision covering deferred schema
compilation, plugin field declarations, generated types, application isolation,
model construction, and command lifecycle before production implementation.

## Acceptance criteria

- [ ] The ADR defines the complete declaration-to-runtime pipeline and the exact point at which field callbacks resolve.
- [ ] The ADR defines model-construction and static-metadata behavior before and after application schema compilation.
- [ ] The ADR keeps plugin contributions pure, deterministic, owner-scoped, conflict-checked, and independent from infrastructure startup.
- [ ] The ADR defines generated files as deterministic caches derived from static TypeScript schemas and configured plugins.
- [ ] The ADR specifies first generation, stale output, plugin removal, multi-application isolation, class-name collisions, circular relationships, and read-only deployment behavior.
- [ ] The ADR explains how the decision refines contextual inference, compact field inference, generated type identities, schema construction, and generic codegen orchestration.
- [ ] Explicit non-goals exclude incremental generation, a mutable global FieldBuilder registry, TypeScript compiler plugins, runtime code transformation, and transport-specific generated contracts.
- [ ] `CURRENT_PLAN.md`, the roadmap, and affected issue dependencies agree with the accepted decision.

## Tests

- [ ] The ADR links every claimed editor and runtime property to evidence from issue 801.
