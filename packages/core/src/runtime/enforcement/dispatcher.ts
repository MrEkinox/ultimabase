import { FrameworkApplication } from '../../application/framework-application.js'
import type { PluginDefinition } from '../../foundation.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { immutableRecord } from '@ultimabase/shared'

import { getApplicationRuntimeCallbackExecutor } from '../contributions/execution.js'
import type { RuntimeEnforcementStages } from '../pipeline/contracts.js'
import {
	evaluateEnforcementContributions,
	readEnforcementContributions,
} from './contribution-evaluation.js'
import { enforceOperationRestrictions } from './operation-restrictions.js'
import { createRelationPredicateEvaluator } from './relation-enforcement.js'
import {
	enforceProtectedMutationOutcome,
	enforceProtectedPreparedMutation,
	enforceProtectedRelation,
	protectedPoliciesRequirePreparedMutationItems,
	reevaluateProtectedPolicies,
	restrictProtectedPolicyResult,
} from './protected-policy-execution.js'
import {
	enforceOutputRestrictions,
	enforceSelectionResultRestrictions,
} from './result-restrictions.js'
import { createEnforcementState } from './state.js'

/** Compiles optional product-neutral restrictions into one monotonic boundary. */
export const createEnforcementStages = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
>(
	application: FrameworkApplication<TSchemas, TPlugins>,
): RuntimeEnforcementStages | undefined => {
	if (!(application instanceof FrameworkApplication)) {
		throw new TypeError('Runtime enforcement requires a FrameworkApplication')
	}

	const contributions = readEnforcementContributions(application)
	if (contributions.length === 0) {
		return undefined
	}

	const runtime = getApplicationRuntimeCallbackExecutor(application)
	const evaluateRelationPredicates = createRelationPredicateEvaluator(
		contributions,
		runtime,
	)
	const enforceSelectionResult: RuntimeEnforcementStages['enforceSelectionResult'] =
		async (input) =>
			await restrictProtectedPolicyResult(
				contributions,
				immutableRecord({
					context: input.context,
					operation: input.operation,
					result: enforceSelectionResultRestrictions(input),
				}) as never,
			)
	const enforceResult: RuntimeEnforcementStages['enforceResult'] = async (
		input,
	) =>
		restrictProtectedPolicyResult(
			contributions,
			immutableRecord({
				context: input.context,
				operation: input.operation,
				result: await enforceOutputRestrictions(contributions, runtime, input),
			}),
		)

	return immutableRecord({
		evaluate: async (input) => {
			const state = await evaluateEnforcementContributions(
				contributions,
				runtime,
				input,
				createEnforcementState(),
			)

			return evaluateRelationPredicates(input, state)
		},
		enforceOperation: (input) => enforceOperationRestrictions(input),
		enforceRelationRead: (input) =>
			enforceProtectedRelation(contributions, input),
		enforcePreparedMutation: (input) =>
			enforceProtectedPreparedMutation(contributions, input),
		enforceMutationOutcome: (input) =>
			enforceProtectedMutationOutcome(contributions, input),
		requiresPreparedMutationItems: (operation) =>
			protectedPoliciesRequirePreparedMutationItems(contributions, operation),
		enforceSelectionResult,
		enforceResult,
		reevaluate: async (input) => {
			await reevaluateProtectedPolicies(contributions, input)
			const state = await evaluateEnforcementContributions(
				contributions,
				runtime,
				input,
				input.enforcement,
				false,
			)

			return evaluateRelationPredicates(input, state)
		},
	})
}
