import type {
	QueryExpressionNode,
	QueryRelationFilterNode,
} from '../../query/index.js'
import {
	createQueryAst,
	isQueryRelationCountNode,
	isQueryRelationPredicateNode,
} from '../../query/index.js'
import {
	createQueryRelationComplexityError,
	queryRelationPredicateMaxCount,
} from '../../query/filters/relation.js'
import { traverseQueryExpression } from '../../query/filters/traversal.js'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { DatabaseOperationAst } from '../database/contracts.js'
import type { RuntimeCallbackExecutor } from '../contributions/execution.js'
import { readOperationQueries } from '../operations/queries.js'
import type {
	RuntimeLogicalOperationAst,
	RuntimeOperationStageInput,
} from '../pipeline/contracts.js'
import {
	evaluateEnforcementContributions,
	type OwnedEnforcementContribution,
} from './contribution-evaluation.js'
import { enforceProtectedRelation } from './protected-policy-execution.js'
import {
	appendEnforcementRelationPredicates,
	createEnforcementState,
	getEnforcementStateSnapshot,
	type EnforcementState,
} from './state.js'

/** Reads only the relation leaves owned by the current schema expression level. */
export const collectDirectRelationPredicates = (
	expression: QueryExpressionNode,
): readonly QueryRelationFilterNode[] => {
	const collected: QueryRelationFilterNode[] = []

	traverseQueryExpression(expression, (candidate) => {
		if (
			isQueryRelationCountNode(candidate) ||
			isQueryRelationPredicateNode(candidate)
		) {
			if (collected.length >= queryRelationPredicateMaxCount) {
				throw createQueryRelationComplexityError()
			}
			collected.push(candidate)
			return 'skip'
		}

		return 'continue'
	})

	return immutableArray(collected)
}

/** Creates the target read used to evaluate one relation leaf's private policy. */
export const createRelationPredicateTargetOperation = (
	predicate: QueryRelationFilterNode,
	includePredicate: boolean,
): DatabaseOperationAst => {
	const query = immutableRecord({
		...createQueryAst(predicate.target.definition),
		...(includePredicate
			? {
					where: immutableRecord({
						expression: predicate.expression,
						kind: 'where' as const,
					}),
				}
			: {}),
	})

	return immutableRecord({ kind: 'exists' as const, query })
}

type RelationPredicateEvaluator = <
	const TOperation extends RuntimeLogicalOperationAst,
>(
	input: RuntimeOperationStageInput<TOperation>,
	initialState: EnforcementState,
	policyExpressions?: readonly QueryExpressionNode[],
) => Promise<EnforcementState>

/** Creates one recursive evaluator bound to application-local protected policies. */
export const createRelationPredicateEvaluator = (
	contributions: readonly OwnedEnforcementContribution[],
	runtime: RuntimeCallbackExecutor,
): RelationPredicateEvaluator => {
	const evaluateRelationPredicates: RelationPredicateEvaluator = async (
		input,
		initialState,
		policyExpressions = [],
	) => {
		let state = initialState
		const policyRowFilter = getEnforcementStateSnapshot(state).rowFilter
		const expressions = [
			...readOperationQueries(input.operation).flatMap((query) =>
				query.where === undefined
					? []
					: [
							immutableRecord({
								expression: query.where.expression,
								requiresSourceFieldRestriction: true,
							}),
						],
			),
			...(policyRowFilter === undefined
				? []
				: [
						immutableRecord({
							expression: policyRowFilter,
							requiresSourceFieldRestriction: false,
						}),
					]),
			...policyExpressions.map((expression) =>
				immutableRecord({
					expression,
					requiresSourceFieldRestriction: false,
				}),
			),
		]

		for (const { expression, requiresSourceFieldRestriction } of expressions) {
			for (const predicate of collectDirectRelationPredicates(expression)) {
				if (
					getEnforcementStateSnapshot(state).relationPredicates.some(
						(scope) => scope.predicate === predicate,
					)
				) {
					continue
				}

				// A policy-owned row filter is already trusted server code. Source field
				// disclosure applies only to predicates supplied by the operation caller.
				if (requiresSourceFieldRestriction) {
					await enforceProtectedRelation(
						contributions,
						immutableRecord({
							context: input.context,
							operation: input.operation,
							relation: immutableRecord({
								fieldPath: immutableArray([predicate.field]),
								source: predicate.source.definition,
								target: predicate.target.definition,
							}),
						}),
					)
				}

				const includePredicateInTargetQuery =
					requiresSourceFieldRestriction &&
					!(
						predicate.kind === 'relation-count' &&
						predicate.expression.kind === 'constant' &&
						predicate.expression.value
					)
				const targetOperation = createRelationPredicateTargetOperation(
					predicate,
					includePredicateInTargetQuery,
				)
				const targetInput = immutableRecord({
					context: input.context,
					operation: targetOperation,
				})
				let targetState = await evaluateEnforcementContributions(
					contributions,
					runtime,
					targetInput,
					createEnforcementState(),
				)
				targetState = await evaluateRelationPredicates(
					targetInput,
					targetState,
					requiresSourceFieldRestriction ? [] : [predicate.expression],
				)

				const targetSnapshot = getEnforcementStateSnapshot(targetState)
				state = appendEnforcementRelationPredicates(state, [
					immutableRecord({
						constraints: targetSnapshot.constraints,
						predicate,
						...(targetSnapshot.rowFilter === undefined
							? {}
							: { rowFilter: targetSnapshot.rowFilter }),
					}),
					...targetSnapshot.relationPredicates,
				])
			}
		}

		return state
	}

	return evaluateRelationPredicates
}
