# ADR-0264: Remove unused Runtime stage contributions

- Status: accepted
- Date: 2026-09-21
- Decision issue: [3107](../../issues/3100-residual-complexity-simplification/3107-decide-unused-public-protocols.md), RC-04
- Implementation: [3108](../../issues/3100-residual-complexity-simplification/3108-remove-unused-runtime-stage-contributions.md)
- Reopens: only the stage-definition branch of C-035 in the [milestone 30 matrix](../plans/2026-09-20-architecture-contract-matrix.md)
- Approval: user explicitly accepted all three separately presented RC-04/RC-05/RC-06 removals on 2026-09-21, including the engineering-consumer exceptions

## Evidence and current behavior

`runtimePipelineStage({ stage, handler })` creates nominal definitions for
`normalization` or `commit`. `provideRuntimeInterceptor` publishes them under
`runtime:intercept`. Core collects these definitions in plugin order and wraps
callbacks with their actual owner before composing them into Runtime assembly.
They can transform an operation before structural validation or run a commit
effect. This is a public extension power, not the database transaction itself.

Repository consumers are the factory unit/type tests and
`runtime/application/create-framework-engine.test.ts`. No production plugin
creates these definitions. In particular, ACL uses `preparedOperation` through
`provideRuntimeInterceptor`; it does not use this stage factory. Low-level
`RuntimePipelineStages` is a separate, used contract, including for internal
performance measurements.

Sources: [factory](../../packages/core/src/runtime/pipeline/definitions.ts),
[interceptor union and validation](../../packages/core/src/runtime/capabilities.ts),
[assembly](../../packages/core/src/runtime/application/create-framework-engine.ts).

## Decision and exact scope

Remove the following Core exports and their exclusive implementation:

- `runtimePipelineStage`;
- `RuntimePipelineStageDefinition`, `RuntimePipelineStageHandler`,
  `RuntimePipelineStageName`, `RuntimePipelineStageOptions`;
- the `{ stage }` alternative of `RuntimeInterceptorDefinition`;
- the factory's private branding/WeakMap/validation, stage collection,
  attribution wrappers and contributed normalization/commit composition.

Core assembly keeps its ordinary normalization and commit implementations.
Do not change `RuntimePipeline`, `RuntimePipelineStages` or the existing
low-level stage contracts as part of this removal. Do not rename or replace
the removed plugin factory, add an assembly option, or change dependency direction.

The observable loss is exactly the ability for a plugin to contribute these
two low-level stages. Keep C-035's `runtimeInterceptorCapability` and
`provideRuntimeInterceptor`, `beforeOperation`, `afterOperation`,
`preparedOperation`, their deterministic order and owner attribution. Keep
`runtime:intercept`, protected constraints, product behavior, mandatory
validation, transactions/rollback, Hook `beforeCommit`/`afterCommit`, and
post-commit events.

## Verification and documentation

3108 must retain Runtime order, normalization, transaction, callback-owner,
ACL and no-product cost regressions; only removed-factory self-tests disappear.
Verify source and built/packed exports/types and reject forged former stage
definitions through the remaining interceptor validator. Compare retained
coverage and run the cross-cutting Runtime/PostgreSQL/transport gates.

Review/update Core's README and `packages/core/docs/runtime.md`, architecture
contracts, and website pages `plugins/build-a-plugin/runtime-and-infrastructure`
and `core/runtime/runtime-pipeline` in 3108. These live contracts remain
unchanged until implementation.

## Alternative considered and outcome

Retain the API and its tests if low-level stage contribution is a current
requirement. That choice supersedes 3108 without an empty implementation commit.
Recommended: remove the exact unused branch above, preserving every used
interceptor and the transaction pipeline. No performance gain is promised.

Outcome: the user accepted the exact removal above. The implementation remains
bounded by this inventory and must complete its own validation/audit loop.
