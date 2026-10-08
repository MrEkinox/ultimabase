import { immutableRecord, type MaybePromise } from '@ultimabase/shared'

import type { DatabaseMutationOperationAst } from '../database/contracts.js'
import type {
	RuntimeLogicalMutationOperationAst,
	RuntimeLogicalOperationAst,
	RuntimeMutationOutcomeStageInput,
	RuntimeOperationStageInput,
	RuntimePreparedMutationStageInput,
	RuntimeRelationEnforcementStageInput,
	RuntimeResultStageInput,
} from '../pipeline/contracts.js'
import {
	bypassesMaster,
	readEnforcementOperationSchema,
	type OwnedEnforcementContribution,
} from './contribution-evaluation.js'
import { matchesEnforcementContribution } from './definitions.js'
import { createProtectedPolicyDeniedError } from './protected-denial.js'
import type { ProtectedPolicyImplementation } from './protected-policy.js'
import { validateProtectedPolicyResultSubset } from './protected-result.js'

const matchingPolicies = (
	contributions: readonly OwnedEnforcementContribution[],
	input: RuntimeOperationStageInput<RuntimeLogicalOperationAst>,
): readonly ProtectedPolicyImplementation[] => {
	const schema = readEnforcementOperationSchema(input.operation)

	return contributions.flatMap(({ implementation }) =>
		implementation.kind === 'protected-policy' &&
		!bypassesMaster(implementation, input.context) &&
		matchesEnforcementContribution(implementation, input.operation, schema)
			? [implementation]
			: [],
	)
}

/** Denies when any matching policy guard returns false; true or omission allow. */
const requireMatchingPolicies = async (
	contributions: readonly OwnedEnforcementContribution[],
	input: RuntimeOperationStageInput<RuntimeLogicalOperationAst>,
	decide: (policy: ProtectedPolicyImplementation) => MaybePromise<unknown>,
): Promise<void> => {
	for (const policy of matchingPolicies(contributions, input)) {
		const decision = await decide(policy)
		if (decision !== undefined && typeof decision !== 'boolean') {
			throw new TypeError(
				'Protected policy guards must return a boolean or undefined',
			)
		}
		if (decision === false) {
			throw createProtectedPolicyDeniedError()
		}
	}
}

/** Rechecks value-dependent policies without exposing accumulated enforcement. */
export const reevaluateProtectedPolicies = <
	const TOperation extends RuntimeLogicalOperationAst,
>(
	contributions: readonly OwnedEnforcementContribution[],
	input: RuntimeOperationStageInput<TOperation>,
): Promise<void> =>
	requireMatchingPolicies(contributions, input, ({ reevaluate }) =>
		reevaluate?.(input),
	)

/** Denies one relationship traversal when any matching policy rejects it. */
export const enforceProtectedRelation = <
	const TOperation extends RuntimeLogicalOperationAst,
>(
	contributions: readonly OwnedEnforcementContribution[],
	input: RuntimeRelationEnforcementStageInput<TOperation>,
): Promise<void> =>
	requireMatchingPolicies(contributions, input, ({ relation }) =>
		relation?.(input),
	)

/** Denies one stable mutation target when any matching policy rejects it. */
export const enforceProtectedPreparedMutation = <
	const TOperation extends RuntimeLogicalMutationOperationAst,
	const TTarget,
>(
	contributions: readonly OwnedEnforcementContribution[],
	input: RuntimePreparedMutationStageInput<TOperation, TTarget>,
): Promise<void> =>
	requireMatchingPolicies(contributions, input, ({ preparedMutation }) =>
		preparedMutation?.(input),
	)

/** Denies one actual mutation branch when any matching policy rejects it. */
export const enforceProtectedMutationOutcome = async <
	const TOperation extends RuntimeLogicalMutationOperationAst,
	const TOutcome,
>(
	contributions: readonly OwnedEnforcementContribution[],
	input: RuntimeMutationOutcomeStageInput<TOperation, TOutcome>,
): Promise<TOutcome> => {
	await requireMatchingPolicies(contributions, input, ({ mutationOutcome }) =>
		mutationOutcome?.(input),
	)
	return input.outcome
}

/** Reports stable preimage needs without granting providers adapter access. */
export const protectedPoliciesRequirePreparedMutationItems = (
	contributions: readonly OwnedEnforcementContribution[],
	operation: DatabaseMutationOperationAst,
): boolean => {
	const schema = readEnforcementOperationSchema(operation)

	return contributions.some(
		({ implementation }) =>
			implementation.kind === 'protected-policy' &&
			matchesEnforcementContribution(implementation, operation, schema) &&
			implementation.requiresPreparedMutationItems?.(operation) === true,
	)
}

/** Applies every protected projection while proving each step remains a subset. */
export const restrictProtectedPolicyResult = async <
	const TOperation extends RuntimeLogicalOperationAst,
	const TResult,
>(
	contributions: readonly OwnedEnforcementContribution[],
	input: RuntimeResultStageInput<TOperation, TResult>,
): Promise<TResult> => {
	let result = input.result

	for (const policy of matchingPolicies(contributions, input)) {
		if (policy.restrictResult === undefined) continue

		const candidate: unknown = await policy.restrictResult(
			immutableRecord({
				context: input.context,
				operation: input.operation,
				result,
			}),
		)
		if (candidate !== undefined) {
			result = validateProtectedPolicyResultSubset(result, candidate)
		}
	}

	return result
}
