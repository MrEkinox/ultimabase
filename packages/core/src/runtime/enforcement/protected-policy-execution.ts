import { immutableRecord } from '@ultimabase/shared'

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
	readEnforcementOperationSchema,
	type OwnedEnforcementContribution,
} from './contribution-evaluation.js'
import { createProtectedPolicyDeniedError } from './protected-denial.js'
import {
	matchesProtectedPolicy,
	type ProtectedPolicyImplementation,
} from './protected-policy.js'
import { validateProtectedPolicyResultSubset } from './protected-result.js'

const matchingPolicies = (
	contributions: readonly OwnedEnforcementContribution[],
	input: RuntimeOperationStageInput<RuntimeLogicalOperationAst>,
): readonly ProtectedPolicyImplementation[] => {
	const schema = readEnforcementOperationSchema(input.operation)

	return contributions.flatMap(({ implementation }) =>
		implementation.kind === 'protected-policy' &&
		!(
			input.context.access.mode === 'master' &&
			implementation.master === 'bypass'
		) &&
		matchesProtectedPolicy(implementation, input.operation, schema)
			? [implementation]
			: [],
	)
}

const requireAllowed = (decision: unknown): void => {
	if (decision !== undefined && typeof decision !== 'boolean') {
		throw new TypeError(
			'Protected policy guards must return a boolean or undefined',
		)
	}
	if (decision === false) {
		throw createProtectedPolicyDeniedError()
	}
}

/** Rechecks value-dependent policies without exposing accumulated enforcement. */
export const reevaluateProtectedPolicies = async <
	const TOperation extends RuntimeLogicalOperationAst,
>(
	contributions: readonly OwnedEnforcementContribution[],
	input: RuntimeOperationStageInput<TOperation>,
): Promise<void> => {
	for (const policy of matchingPolicies(contributions, input)) {
		if (policy.reevaluate !== undefined) {
			requireAllowed(await policy.reevaluate(input))
		}
	}
}

/** Denies one relationship traversal when any matching policy rejects it. */
export const enforceProtectedRelation = async <
	const TOperation extends RuntimeLogicalOperationAst,
>(
	contributions: readonly OwnedEnforcementContribution[],
	input: RuntimeRelationEnforcementStageInput<TOperation>,
): Promise<void> => {
	for (const policy of matchingPolicies(contributions, input)) {
		if (policy.relation !== undefined) {
			requireAllowed(await policy.relation(input))
		}
	}
}

/** Denies one stable mutation target when any matching policy rejects it. */
export const enforceProtectedPreparedMutation = async <
	const TOperation extends RuntimeLogicalMutationOperationAst,
	const TTarget,
>(
	contributions: readonly OwnedEnforcementContribution[],
	input: RuntimePreparedMutationStageInput<TOperation, TTarget>,
): Promise<void> => {
	for (const policy of matchingPolicies(contributions, input)) {
		if (policy.preparedMutation !== undefined) {
			requireAllowed(await policy.preparedMutation(input))
		}
	}
}

/** Denies one actual mutation branch when any matching policy rejects it. */
export const enforceProtectedMutationOutcome = async <
	const TOperation extends RuntimeLogicalMutationOperationAst,
	const TOutcome,
>(
	contributions: readonly OwnedEnforcementContribution[],
	input: RuntimeMutationOutcomeStageInput<TOperation, TOutcome>,
): Promise<TOutcome> => {
	for (const policy of matchingPolicies(contributions, input)) {
		if (policy.mutationOutcome !== undefined) {
			requireAllowed(await policy.mutationOutcome(input))
		}
	}

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
			matchesProtectedPolicy(implementation, operation, schema) &&
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
