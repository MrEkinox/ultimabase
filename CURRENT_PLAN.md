# Current plan: Runtime logical-operation typing

- Status: active
- Milestone: 44
- Baseline: `d97afb1b`
- Current issue: 4403

The user authorized the next repository-wide debt reduction on 2026-09-26 while
retaining every functional capability. Core's schema-mutation pipeline already
passes its product-neutral `plugin-schema-mutation` identity through generic
policy, behavior, result, and commit stages, but their exported types claim to
accept only physical database operations. The implementation compensates with
repeated `as never` and `as unknown as` bridges.

Milestone 44 makes those shared stages accept the truthful closed logical union
while keeping ordinary CRUD and schema-mutation execution separate. Adapter,
normalization, structural validation, prepared-transform, and persistence
contracts remain database-operation-only unless they already receive the
logical custom mutation today.

Issue 4401 added the closed logical operation vocabulary and correlated shared
stage inputs while retaining native-only adapter and CRUD pipeline contracts.
It also aligned public interceptor and policy filters with the schema-mutation
identity they already observed when no operation filter was configured.

Issue 4402 removed the schema-mutation pipeline's forced shared-stage casts and
aligned Access, Hooks, ACL, and alternative-engine fixtures with the logical
union. Native and custom mutation execution remain separate; the only retained
schema-executor double assertion is the opaque adapter preparation boundary.

No push is authorized.
