import type {
	ExecutableOperationAst,
	QueryExpressionNode,
	QueryRelationFilterNode,
} from '../../query/index.js'
import {
	createQueryAst,
	isQueryRelationCountNode,
	isQueryRelationPredicateNode,
} from '../../query/index.js'
import { traverseQueryExpression } from '../../query/filters/traversal.js'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { NativeAccessRuntime } from '../access/dispatcher.js'
import type { DatabaseOperationAst } from '../database/contracts.js'
import type { HookExecutionRuntime } from '../hooks/execution-runtime.js'
import { readOperationQueries } from '../operations/queries.js'
import type { RuntimeOperationStageInput } from '../pipeline/contracts.js'
import {
	evaluateEnforcementContributions,
	type OwnedEnforcementContribution,
} from './contribution-evaluation.js'
import {
	appendEnforcementRelationPredicates,
	createEnforcementState,
	getEnforcementStateSnapshot,
	type EnforcementState,
} from './state.js'

/** Reads only the relation leaves owned by the current schema expression level. */
const collectDirectRelationPredicates = (
	expression: QueryExpressionNode,
): readonly QueryRelationFilterNode[] => {
	const collected: QueryRelationFilterNode[] = []

	traverseQueryExpression(expression, (candidate) => {
		if (
			isQueryRelationCountNode(candidate) ||
			isQueryRelationPredicateNode(candidate)
		) {
			collected.push(candidate)
			return 'skip'
		}

		return 'continue'
	})

	return immutableArray(collected)
}

type RelationPredicateEvaluator = <
	const TOperation extends DatabaseOperationAst,
>(
	input: RuntimeOperationStageInput<TOperation>,
	initialState: EnforcementState,
	policyExpressions?: readonly QueryExpressionNode[],
) => Promise<EnforcementState>

/** Creates one recursive evaluator bound to an application-local Access plan. */
export const createRelationPredicateEvaluator = (
	access: NativeAccessRuntime,
	contributions: readonly OwnedEnforcementContribution[],
	runtime: HookExecutionRuntime,
): RelationPredicateEvaluator => {
	const evaluateRelationPredicates: RelationPredicateEvaluator = async (
		input,
		initialState,
		policyExpressions = [],
	) => {
		// Structural validation has already proven the closed executable-operation union.
		const executable = input.operation as unknown as ExecutableOperationAst
		let state = initialState
		const policyRowFilter = getEnforcementStateSnapshot(state).rowFilter
		const expressions = [
			...readOperationQueries(executable).flatMap((query) =>
				query.where === undefined
					? []
					: [
							immutableRecord({
								expression: query.where.expression,
								requireSourceFieldAccess: true,
							}),
						],
			),
			...(policyRowFilter === undefined
				? []
				: [
						immutableRecord({
							expression: policyRowFilter,
							requireSourceFieldAccess: false,
						}),
					]),
			...policyExpressions.map((expression) =>
				immutableRecord({
					expression,
					requireSourceFieldAccess: false,
				}),
			),
		]

		for (const { expression, requireSourceFieldAccess } of expressions) {
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
				if (requireSourceFieldAccess) {
					await access.enforceRelationPredicateRead(input, predicate)
				}

				const includePredicateInTargetQuery =
					requireSourceFieldAccess &&
					!(
						predicate.kind === 'relation-count' &&
						predicate.expression.kind === 'constant' &&
						predicate.expression.value
					)
				const targetQuery = immutableRecord({
					...createQueryAst(predicate.target.definition),
					...(includePredicateInTargetQuery
						? {
								where: immutableRecord({
									kind: 'where' as const,
									expression: predicate.expression,
								}),
							}
						: {}),
				})
				const targetOperation = immutableRecord({
					kind: 'exists' as const,
					query: targetQuery,
				})
				const targetInput = immutableRecord({
					context: input.context,
					operation: targetOperation,
				})
				let targetState = await access.evaluate(
					targetInput,
					createEnforcementState(),
				)

				targetState = await evaluateEnforcementContributions(
					contributions,
					runtime,
					targetInput,
					targetState,
				)
				targetState = await evaluateRelationPredicates(
					targetInput,
					targetState,
					requireSourceFieldAccess ? [] : [predicate.expression],
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
