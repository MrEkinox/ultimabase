import type { MaybePromise } from '@ultimabase/shared'
import type {
	OperationRecordResult,
	OperationAstNode,
} from '../../query/index.js'

import type { RequestContext } from '../context/request-context.js'
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
	DatabaseRelationReference,
	DatabaseRelationScope,
	DatabaseRelationPredicateScope,
} from '../database/contracts.js'
import type { EnforcementState } from '../enforcement/state.js'
import type { RuntimePersistencePlanRewriteStage } from '../persistence/contracts.js'
import type { RuntimeNestedWriteStageContext } from '../nested-writes/execution-context.js'

/** Starts one pipeline execution with trusted request identity and one Operation AST. */
export interface RuntimePipelineRequest<
	TOperation extends DatabaseOperationAst,
> {
	readonly context: RequestContext
	readonly operation: TOperation
	/** Keeps a validated relation edge private from transformable behavior inputs. */
	readonly relation?: DatabaseRelationScope
	/** Carries a framework-owned predicate that product behaviors cannot replace. */
	readonly rowFilter?: DatabaseRowFilterNode
	/** Carries target restrictions associated with exact public relation leaves. */
	readonly relationPredicates?: readonly DatabaseRelationPredicateScope[]
	/** Treats a protected target's policy denial exactly like an absent target. */
	readonly protectedPolicyDeniedAsMissing?: true
}

/** Supplies normalization, validation, guards, and behaviors with immutable request state. */
export interface RuntimeOperationStageInput<
	TOperation extends DatabaseOperationAst,
> {
	readonly context: RequestContext
	/** Identifies the Core-owned nested node currently using this ordinary lifecycle. */
	readonly nestedWrite?: RuntimeNestedWriteStageContext
	readonly operation: TOperation
}

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
	/** Keeps target restrictions outside the source operation transformed by behaviors. */
	readonly relationPredicates?: readonly DatabaseRelationPredicateScope[]
}

/** Represents the post-hydration record shape observed by result behaviors. */
export type RuntimeOperationResult<TOperation extends OperationAstNode> =
	OperationRecordResult<TOperation>

/** Supplies pre-hydration adapter records to projection and scalar resolution. */
export interface RuntimeDatabaseResultStageInput<
	TOperation extends DatabaseOperationAst,
> extends RuntimeOperationStageInput<TOperation> {
	readonly result: DatabaseOperationResult<TOperation>
}

/** Supplies result behaviors, commit, and observers with the current result. */
export interface RuntimeResultStageInput<
	TOperation extends DatabaseOperationAst,
> extends RuntimeOperationStageInput<TOperation> {
	readonly result: RuntimeOperationResult<TOperation>
}

/** Transforms one exact operation without changing its schema-specific type. */
export type RuntimeOperationTransformStage = <
	const TOperation extends DatabaseOperationAst,
>(
	input: RuntimeOperationStageInput<TOperation>,
) => MaybePromise<TOperation>

/** Supplies the normalized operation that bounds one final mutation replacement. */
export interface RuntimeMutationRevalidationStageInput<
	TOperation extends DatabaseMutationOperationAst,
> extends RuntimeOperationStageInput<TOperation> {
	readonly previousOperation: TOperation
	/** Carries the stable singular preimage used to validate projected arithmetic. */
	readonly target: DatabaseMutationLogicalRecord<TOperation> | null | undefined
	/** Carries complete stable bulk preimages only when the adapter prepared them. */
	readonly targets?: readonly DatabaseMutationLogicalRecord<TOperation>[]
}

/** Revalidates one final mutation without replaying defaults or generators. */
export type RuntimeMutationRevalidationStage = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	input: RuntimeMutationRevalidationStageInput<TOperation>,
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
) => MaybePromise<RuntimeOperationResult<TOperation>>

/** Applies selection restrictions before pointer hydration changes field values. */
export type RuntimeEnforcementSelectionResultStage = <
	const TOperation extends DatabaseOperationAst,
>(
	input: RuntimeDatabaseResultStageInput<TOperation> & {
		readonly enforcement: EnforcementState
	},
) => MaybePromise<DatabaseOperationResult<TOperation>>

/** Supplies one protected relation traversal only to monotonic enforcement. */
export interface RuntimeRelationEnforcementStageInput<
	TOperation extends DatabaseOperationAst = DatabaseOperationAst,
> extends RuntimeOperationStageInput<TOperation> {
	readonly relation: DatabaseRelationReference
}

/** Authorizes one source relation field before its target query executes. */
export type RuntimeRelationEnforcementStage = <
	const TOperation extends DatabaseOperationAst,
>(
	input: RuntimeRelationEnforcementStageInput<TOperation>,
) => MaybePromise<void>

/** Groups policy-neutral effects without manufacturing absent policy stages. */
export interface RuntimeEnforcementStages {
	readonly evaluate: RuntimeEnforcementEvaluationStage
	readonly reevaluate: RuntimeEnforcementReevaluationStage
	readonly enforceOperation: RuntimeEnforcementOperationStage
	/** Applies retained selection restrictions before output behaviors run. */
	readonly enforceSelectionResult: RuntimeEnforcementSelectionResultStage
	readonly enforceResult: RuntimeEnforcementResultStage
	/** Enforces the source field that grants one to-many traversal. */
	readonly enforceRelationRead?: RuntimeRelationEnforcementStage
	/** Enforces item rules against a stable singular mutation target. */
	readonly enforcePreparedMutation?: RuntimePreparedMutationEffectStage
	/** Enforces the exact create or update branch materialized by a mutation. */
	readonly enforceMutationOutcome?: RuntimeMutationOutcomeTransformStage
	/** Requests stable set-based preimages when installed policies need them. */
	readonly requiresPreparedMutationItems?: (
		operation: DatabaseMutationOperationAst,
	) => boolean
}

/** Transforms one adapter result while preserving operation result semantics. */
export type RuntimeResultTransformStage = <
	const TOperation extends DatabaseOperationAst,
>(
	input: RuntimeResultStageInput<TOperation>,
) => MaybePromise<RuntimeOperationResult<TOperation>>

/** Carries an exact pre-hydration projection into scalar field resolution. */
export interface RuntimeProjectedDatabaseResultStageInput<
	TOperation extends DatabaseOperationAst,
> extends RuntimeDatabaseResultStageInput<TOperation> {
	readonly selectedFieldsOverride?: readonly string[]
}

/** Resolves scalar output while pointer fields still retain declared values. */
export type RuntimeProjectedDatabaseResultTransformStage = <
	const TOperation extends DatabaseOperationAst,
>(
	input: RuntimeProjectedDatabaseResultStageInput<TOperation>,
) => MaybePromise<DatabaseOperationResult<TOperation>>

/** Carries an exact policy projection when an empty QueryBuilder selection means no fields. */
export interface RuntimeMaterializedResultStageInput<
	TOperation extends DatabaseOperationAst,
> extends RuntimeResultStageInput<TOperation> {
	/** Carries complete mutation snapshots without exposing them through selection. */
	readonly outcome?: DatabaseMutationMaterializationSource
	readonly selectedFieldsOverride?: readonly string[]
}

/** Transforms one native result without losing its effective projection boundary. */
export type RuntimeMaterializedResultTransformStage = <
	const TOperation extends DatabaseOperationAst,
>(
	input: RuntimeMaterializedResultStageInput<TOperation>,
) => MaybePromise<RuntimeOperationResult<TOperation>>

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
	/** Contains stable set-based preimages only when installed behaviors require them. */
	readonly targets?: readonly DatabaseMutationLogicalRecord<TOperation>[]
}

/** Supplies complete private materializations separately from the public result. */
export interface RuntimeMutationOutcomeStageInput<
	TOperation extends DatabaseMutationOperationAst,
> extends RuntimeOperationStageInput<TOperation> {
	readonly outcome: DatabaseOperationOutcome<TOperation>
}

/** Executes affected-field behavior without granting handle ownership. */
export type RuntimePreparedMutationEffectStage = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	input: RuntimePreparedMutationStageInput<TOperation>,
) => MaybePromise<void>

/** Rejects one final structurally valid mutation without replacing it. */
export type RuntimeFinalMutationGuardStage = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	input: RuntimePreparedMutationStageInput<TOperation>,
) => MaybePromise<void>

/** Replaces values for one locked singular mutation without changing its target. */
export type RuntimePreparedMutationTransformStage = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	input: RuntimePreparedMutationStageInput<TOperation>,
) => MaybePromise<TOperation>

/** Validates private materializations while executing their field effects. */
export type RuntimeMutationOutcomeTransformStage = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	input: RuntimeMutationOutcomeStageInput<TOperation>,
) => MaybePromise<DatabaseOperationOutcome<TOperation>>

/**
 * Groups optional product behavior at Core-owned logical Runtime boundaries.
 *
 * Providers never receive adapters, commit controls, protected enforcement
 * state, or permission to replace the complete request pipeline.
 */
export interface RuntimeBehaviorStages {
	/** Requests stable mutation preimages only when this behavior consumes them. */
	readonly requiresPreparedMutationItems?: (
		operation: DatabaseMutationOperationAst,
	) => boolean
	/** Transforms normalized create or update input before value-dependent policy checks. */
	readonly transformInput?: RuntimeOperationTransformStage
	/** Transforms one singular mutation after its visible target is stable. */
	readonly transformPreparedInput?: RuntimePreparedMutationTransformStage
	/** Applies a late target-aware operation transform before final revalidation. */
	readonly transformPreparedOperation?: RuntimePreparedMutationTransformStage
	/** Guards final mutation input after structural validation and before reevaluation. */
	readonly guardMutationInput?: RuntimeFinalMutationGuardStage
	/** Observes the final logical operation immediately before persistence. */
	readonly beforeOperation?: RuntimeOperationGuardStage
	/** Observes stable mutation targets before the adapter operation executes. */
	readonly observePreparedMutation?: RuntimePreparedMutationEffectStage
	/** Transforms complete mutation materializations before result projection. */
	readonly transformMutationOutcome?: RuntimeMutationOutcomeTransformStage
	/** Transforms the policy-filtered database result before relationship hydration. */
	readonly transformDatabaseResult?: RuntimeProjectedDatabaseResultTransformStage
	/** Transforms the hydrated logical result before final protected restrictions. */
	readonly transformResult?: RuntimeMaterializedResultTransformStage
	/** Performs external delivery only after a successful commit. */
	readonly postCommit?: RuntimeResultEffectStage
}

/**
 * Requires every semantic phase explicitly so application assembly cannot omit
 * a security, transaction, or event boundary by leaving a callback undefined.
 */
export interface RuntimePipelineStages {
	readonly normalization: RuntimeOperationTransformStage
	readonly structuralValidation: RuntimeOperationTransformStage
	/** Validates the final mutation candidate after every optional input transform. */
	readonly finalMutationValidation: RuntimeMutationRevalidationStage
	readonly databaseOperation: DatabaseOperationExecutor
	readonly commit: RuntimeResultEffectStage
	/** Rewrites only the physical plan after logical semantics and protected policy are fixed. */
	readonly persistencePlanRewrite?: RuntimePersistencePlanRewriteStage
	/** Present only when at least one plugin provides product behavior. */
	readonly behaviors?: RuntimeBehaviorStages
	/** Present only when at least one plugin contributed monotonic enforcement. */
	readonly enforcement?: RuntimeEnforcementStages
}
