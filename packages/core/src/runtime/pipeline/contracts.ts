import type { MaybePromise } from '@ultimabase/shared'

import type { RequestContext } from '../context/request-context.js'
import type {
	DatabaseConstraintNode,
	DatabaseMutationLogicalRecord,
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationOutcome,
	DatabaseOperationExecutor,
	DatabaseOperationResult,
} from '../database/contracts.js'
import type { EnforcementState } from '../enforcement/state.js'

/** Starts one pipeline execution with trusted request identity and one Operation AST. */
export interface RuntimePipelineRequest<
	TOperation extends DatabaseOperationAst,
> {
	readonly context: RequestContext
	readonly operation: TOperation
}

/** Supplies normalization, validation, guards, and hooks with immutable request state. */
export type RuntimeOperationStageInput<
	TOperation extends DatabaseOperationAst,
> = RuntimePipelineRequest<TOperation>

/** Carries private monotonic state without exposing it to plugin handlers. */
export interface RuntimeEnforcementStageInput<
	TOperation extends DatabaseOperationAst,
> extends RuntimeOperationStageInput<TOperation> {
	readonly enforcement: EnforcementState
}

/** Reapplies every retained restriction and forwards accumulated constraints. */
export interface RuntimeEnforcementOperationResult<
	TOperation extends DatabaseOperationAst,
> {
	readonly operation: TOperation
	readonly constraints: readonly DatabaseConstraintNode[]
}

/** Supplies business after-hooks, commit, and events with the current result. */
export interface RuntimeResultStageInput<
	TOperation extends DatabaseOperationAst,
> extends RuntimeOperationStageInput<TOperation> {
	readonly result: DatabaseOperationResult<TOperation>
}

/** Transforms one exact operation without changing its schema-specific type. */
export type RuntimeOperationTransformStage = <
	const TOperation extends DatabaseOperationAst,
>(
	input: RuntimeOperationStageInput<TOperation>,
) => MaybePromise<TOperation>

/** Observes or rejects one operation without replacing its trusted context. */
export type RuntimeOperationGuardStage = <
	const TOperation extends DatabaseOperationAst,
>(
	input: RuntimeOperationStageInput<TOperation>,
) => MaybePromise<void>

/** Evaluates deny-only and monotonic contributions before business effects. */
export type RuntimeEnforcementEvaluationStage = <
	const TOperation extends DatabaseOperationAst,
>(
	input: RuntimeOperationStageInput<TOperation>,
) => MaybePromise<EnforcementState>

/** Rechecks transformed values while retaining the existing monotonic state. */
export type RuntimeEnforcementReevaluationStage = <
	const TOperation extends DatabaseOperationAst,
>(
	input: RuntimeEnforcementStageInput<TOperation>,
) => MaybePromise<EnforcementState>

/** Applies retained input and selection intersections to one exact operation. */
export type RuntimeEnforcementOperationStage = <
	const TOperation extends DatabaseOperationAst,
>(
	input: RuntimeEnforcementStageInput<TOperation>,
) => MaybePromise<RuntimeEnforcementOperationResult<TOperation>>

/** Applies the final output intersection after every result transform. */
export type RuntimeEnforcementResultStage = <
	const TOperation extends DatabaseOperationAst,
>(
	input: RuntimeResultStageInput<TOperation> & {
		readonly enforcement: EnforcementState
	},
) => MaybePromise<DatabaseOperationResult<TOperation>>

/** Groups policy-neutral effects without manufacturing absent policy stages. */
export interface RuntimeEnforcementStages {
	readonly evaluate: RuntimeEnforcementEvaluationStage
	readonly reevaluate: RuntimeEnforcementReevaluationStage
	readonly enforceOperation: RuntimeEnforcementOperationStage
	readonly enforceResult: RuntimeEnforcementResultStage
}

/** Transforms one adapter result while preserving operation result semantics. */
export type RuntimeResultTransformStage = <
	const TOperation extends DatabaseOperationAst,
>(
	input: RuntimeResultStageInput<TOperation>,
) => MaybePromise<DatabaseOperationResult<TOperation>>

/** Performs commit or post-commit work without replacing the developer result. */
export type RuntimeResultEffectStage = <
	const TOperation extends DatabaseOperationAst,
>(
	input: RuntimeResultStageInput<TOperation>,
) => MaybePromise<void>

/** Supplies the prepared singular target without exposing the executable handle. */
export interface RuntimePreparedMutationStageInput<
	TOperation extends DatabaseMutationOperationAst,
> extends RuntimeOperationStageInput<TOperation> {
	readonly target: DatabaseMutationLogicalRecord<TOperation> | null | undefined
}

/** Supplies complete private materializations separately from the public result. */
export interface RuntimeMutationOutcomeStageInput<
	TOperation extends DatabaseMutationOperationAst,
> extends RuntimeOperationStageInput<TOperation> {
	readonly outcome: DatabaseOperationOutcome<TOperation>
}

/** Executes affected-field before hooks without granting handle ownership. */
export type RuntimePreparedMutationEffectStage = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	input: RuntimePreparedMutationStageInput<TOperation>,
) => MaybePromise<void>

/** Validates private materializations while executing their field effects. */
export type RuntimeMutationOutcomeTransformStage = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	input: RuntimeMutationOutcomeStageInput<TOperation>,
) => MaybePromise<DatabaseOperationOutcome<TOperation>>

/** Groups the native dispatcher without changing low-level ADR-0070 stages. */
export interface RuntimeNativeHookStages {
	readonly resolveInput: RuntimeOperationTransformStage
	readonly revalidate: RuntimeOperationTransformStage
	readonly validate: RuntimeOperationGuardStage
	readonly schemaBefore: RuntimeOperationTransformStage
	readonly fieldBefore: RuntimePreparedMutationEffectStage
	readonly fieldAfter: RuntimeMutationOutcomeTransformStage
	readonly schemaAfter: RuntimeResultTransformStage
}

/**
 * Requires every semantic phase explicitly so application assembly cannot omit
 * a security, transaction, or event boundary by leaving a callback undefined.
 */
export interface RuntimePipelineStages {
	readonly normalization: RuntimeOperationTransformStage
	readonly structuralValidation: RuntimeOperationTransformStage
	readonly globalBeforeHooks: RuntimeOperationTransformStage
	readonly schemaBeforeHooks: RuntimeOperationTransformStage
	readonly databaseOperation: DatabaseOperationExecutor
	readonly schemaAfterHooks: RuntimeResultTransformStage
	readonly globalAfterHooks: RuntimeResultTransformStage
	readonly commit: RuntimeResultEffectStage
	readonly postCommitEvents: RuntimeResultEffectStage
	/** Installed by application assembly when native declarations are compiled. */
	readonly nativeHooks?: RuntimeNativeHookStages
	/** Present only when at least one plugin contributed monotonic enforcement. */
	readonly enforcement?: RuntimeEnforcementStages
}
