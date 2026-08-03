import type { MaybePromise } from '@ultimabase/shared'

import type { RequestContext } from '../context/request-context.js'
import type {
	HookErrorPhase,
	HookErrorTransactionState,
} from '../../schema/hooks/contracts.js'
import type {
	DatabaseConstraintNode,
	DatabaseRowFilterNode,
	DatabaseMutationLogicalRecord,
	DatabaseMutationMaterializationSource,
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
	/** Carries a framework-owned predicate that business hooks cannot replace. */
	readonly rowFilter?: DatabaseRowFilterNode
	/** Treats an included target's Access denial exactly like an absent target. */
	readonly nativeAccessDeniedAsMissing?: true
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
	/** Keeps private row restrictions outside business-transformable operation state. */
	readonly rowFilter?: DatabaseRowFilterNode
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
	/** Applies retained selection restrictions before business output hooks run. */
	readonly enforceSelectionResult: RuntimeEnforcementResultStage
	readonly enforceResult: RuntimeEnforcementResultStage
	/** Enforces item rules against a stable singular mutation target. */
	readonly enforcePreparedMutation?: RuntimePreparedMutationEffectStage
	/** Enforces the exact create or update branch materialized by a mutation. */
	readonly enforceMutationOutcome?: RuntimeMutationOutcomeTransformStage
}

/** Transforms one adapter result while preserving operation result semantics. */
export type RuntimeResultTransformStage = <
	const TOperation extends DatabaseOperationAst,
>(
	input: RuntimeResultStageInput<TOperation>,
) => MaybePromise<DatabaseOperationResult<TOperation>>

/** Carries an exact policy projection when an empty Query selection means no fields. */
export interface RuntimeNativeResultStageInput<
	TOperation extends DatabaseOperationAst,
> extends RuntimeResultStageInput<TOperation> {
	readonly selectedFieldsOverride?: readonly string[]
}

/** Transforms one native result without losing its effective projection boundary. */
export type RuntimeNativeResultTransformStage = <
	const TOperation extends DatabaseOperationAst,
>(
	input: RuntimeNativeResultStageInput<TOperation>,
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

/** Retains mutable journal state behind an operation-local internal handle. */
export interface RuntimeNativeTransactionOperation {
	succeed(
		operation: DatabaseOperationAst,
		result: unknown,
		outcome?: DatabaseMutationMaterializationSource,
	): void
	fail(
		operation: DatabaseOperationAst,
		error: unknown,
		phase: HookErrorPhase,
	): void
}

/** Owns native hook finalization for exactly one outer adapter transaction. */
export interface RuntimeNativeTransactionLifecycle {
	start(
		input: RuntimeOperationStageInput<DatabaseOperationAst>,
	): RuntimeNativeTransactionOperation
	beforeCommit(): Promise<void>
	afterCommit(): Promise<void>
	afterRollback(error: unknown): Promise<void>
	onError(
		input: Readonly<{
			readonly error: unknown
			readonly phase: HookErrorPhase
			readonly transaction: HookErrorTransactionState
		}>,
	): Promise<void>
}

/** Observes one non-transactional failure after its final state is known. */
export type RuntimeNativeErrorEffectStage = (
	input: RuntimeOperationStageInput<DatabaseOperationAst> &
		Readonly<{
			readonly error: unknown
			readonly phase: HookErrorPhase
			readonly transaction: HookErrorTransactionState
		}>,
) => MaybePromise<void>

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
	readonly resolveOutput: RuntimeNativeResultTransformStage
	readonly schemaAfter: RuntimeNativeResultTransformStage
	/** Creates isolated finalization state only when an outer transaction begins. */
	readonly createTransactionLifecycle?: () => RuntimeNativeTransactionLifecycle
	/** Observes failures for operations that do not own a transaction journal. */
	readonly onError?: RuntimeNativeErrorEffectStage
	/** Installed only on the pipeline derived for one active transaction. */
	readonly transactionLifecycle?: RuntimeNativeTransactionLifecycle
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
