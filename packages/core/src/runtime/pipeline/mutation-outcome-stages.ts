import type { RequestContext } from '../context/request-context.js'
import type { EnforcementState } from '../enforcement/state.js'
import type {
	RuntimeBehaviorStages,
	RuntimeEnforcementStages,
	RuntimeLogicalMutationOperationAst,
} from './contracts.js'
import { createRuntimeStageInput } from './stage-inputs.js'

/** What the outcome stages of one persisted mutation read. */
export interface RuntimeMutationOutcomeStagesRequest<
	TOperation extends RuntimeLogicalMutationOperationAst,
	TBehaviorOperation extends RuntimeLogicalMutationOperationAst,
	TOutcome,
> {
	readonly behaviors: RuntimeBehaviorStages | undefined
	readonly context: RequestContext
	readonly enforcement: RuntimeEnforcementStages | undefined
	readonly enforcementState: EnforcementState | undefined
	/** The resolved operation protected policies enforce. */
	readonly operation: TOperation
	/** The operation outcome behaviors observe. */
	readonly behaviorOperation: TBehaviorOperation
	readonly outcome: TOutcome
	readonly selectedFieldsOverride?: readonly string[] | undefined
}

/**
 * Runs the outcome stages of one persisted native or plugin mutation, in
 * Runtime order: protected outcome enforcement, then outcome behaviors
 * (ADR-0344).
 */
export const runMutationOutcomeStages = async <
	const TOperation extends RuntimeLogicalMutationOperationAst,
	const TBehaviorOperation extends RuntimeLogicalMutationOperationAst,
	TOutcome,
>(
	request: RuntimeMutationOutcomeStagesRequest<
		TOperation,
		TBehaviorOperation,
		TOutcome
	>,
): Promise<TOutcome> => {
	const { behaviors, context, enforcement, selectedFieldsOverride } = request
	let { outcome } = request
	if (
		enforcement?.enforceMutationOutcome !== undefined &&
		request.enforcementState !== undefined
	) {
		outcome = await enforcement.enforceMutationOutcome(
			createRuntimeStageInput({
				context,
				operation: request.operation,
				outcome,
			}),
		)
	}
	if (behaviors?.transformMutationOutcome !== undefined) {
		outcome = await behaviors.transformMutationOutcome(
			createRuntimeStageInput({
				context,
				operation: request.behaviorOperation,
				outcome,
				...(selectedFieldsOverride === undefined
					? {}
					: { selectedFieldsOverride }),
			}),
		)
	}
	return outcome
}
