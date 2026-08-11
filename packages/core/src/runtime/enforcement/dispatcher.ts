import {
	FrameworkApplication,
	type PluginDefinition,
} from '../../foundation.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { immutableRecord } from '@ultimabase/shared'

import { NativeAccessRuntime } from '../access/dispatcher.js'
import { getApplicationHookExecutionRuntime } from '../hooks/execution-runtime.js'
import type { RuntimeEnforcementStages } from '../pipeline/contracts.js'
import {
	evaluateEnforcementContributions,
	readEnforcementContributions,
} from './contribution-evaluation.js'
import { enforceOperationRestrictions } from './operation-restrictions.js'
import { createRelationPredicateEvaluator } from './relation-enforcement.js'
import {
	enforceOutputRestrictions,
	enforceSelectionResultRestrictions,
} from './result-restrictions.js'
import { createEnforcementState } from './state.js'

/** Compiles native Access and optional low-level restrictions into one monotonic boundary. */
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
	const runtime = getApplicationHookExecutionRuntime(application)
	const access = new NativeAccessRuntime(application)
	const evaluateRelationPredicates = createRelationPredicateEvaluator(
		access,
		contributions,
		runtime,
	)
	const enforceAccessSelectionResult: RuntimeEnforcementStages['enforceSelectionResult'] =
		async (input) =>
			access.enforceOutput({
				context: input.context,
				operation: input.operation,
				result: enforceSelectionResultRestrictions(input),
			})
	const enforceAccessResult: RuntimeEnforcementStages['enforceResult'] = async (
		input,
	) =>
		access.enforceOutput({
			context: input.context,
			operation: input.operation,
			result: await enforceOutputRestrictions(contributions, runtime, input),
		})

	return immutableRecord({
		evaluate: async (input) => {
			const state = await evaluateEnforcementContributions(
				contributions,
				runtime,
				input,
				await access.evaluate(input, createEnforcementState()),
			)

			return evaluateRelationPredicates(input, state)
		},
		enforceOperation: (input) => enforceOperationRestrictions(input),
		enforceRelationRead: (input) => access.enforceRelationRead(input),
		enforcePreparedMutation: (input) => access.enforcePreparedMutation(input),
		enforceMutationOutcome: (input) => access.enforceMutationOutcome(input),
		requiresPreparedMutationItems: (operation) =>
			access.requiresPreparedMutationItems(operation),
		enforceSelectionResult: enforceAccessSelectionResult,
		enforceResult: enforceAccessResult,
		reevaluate: async (input) => {
			const state = await evaluateEnforcementContributions(
				contributions,
				runtime,
				input,
				await access.reevaluate(input, input.enforcement),
			)

			return evaluateRelationPredicates(input, state)
		},
	})
}
