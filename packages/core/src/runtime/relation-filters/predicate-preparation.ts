import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	isQueryRelationCountNode,
	queryRelationPredicateMaxDepth,
	type ExecutableOperationAst,
	type QueryExpressionNode,
	type QueryRelationFilterNode,
} from '../../query/index.js'
import { createQueryRelationDepthError } from '../../query/filters/relation.js'
import { readRelationWhereField } from '../../query/filters/relation-where-declaration.js'
import type {
	FrameworkApplication,
	PluginDefinition,
} from '../../foundation.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { getApplicationRuntimeCallbackExecutor } from '../contributions/execution.js'
import type { RequestContext } from '../context/request-context.js'
import type {
	DatabaseOperationAst,
	DatabaseRelationPredicateScope,
	DatabaseRelationReference,
	DatabaseRowFilterNode,
} from '../database/contracts.js'
import {
	evaluateEnforcementContributions,
	readEnforcementContributions,
} from '../enforcement/contribution-evaluation.js'
import { enforceProtectedRelation } from '../enforcement/protected-policy-execution.js'
import {
	collectDirectRelationPredicates,
	createRelationPredicateTargetOperation,
} from '../enforcement/relation-enforcement.js'
import {
	createEnforcementState,
	getEnforcementStateSnapshot,
} from '../enforcement/state.js'
import { readOperationQueries } from '../operations/queries.js'
import { combineDatabaseRowFilters } from '../pipeline/private-execution.js'
import type { RuntimeRelationFilterResolver } from './execution.js'

type RelationFilterApplication = FrameworkApplication<
	readonly SchemaDefinition[],
	readonly PluginDefinition[]
>

/** Supplies the final private filters already accumulated for one root operation. */
export interface RuntimeRelationPredicatePreparationInput {
	readonly context: RequestContext
	readonly operation: DatabaseOperationAst
	readonly relationPredicates?:
		readonly DatabaseRelationPredicateScope[] | undefined
	readonly rowFilter?: DatabaseRowFilterNode | undefined
}

type PredicateOrigin = 'caller' | 'trusted'

const isCollectionPredicate = (predicate: QueryRelationFilterNode): boolean =>
	predicate.kind === 'relation-count' ||
	(predicate.operator !== 'is' && predicate.operator !== 'is-not')

const createRelationReference = (
	predicate: QueryRelationFilterNode,
): DatabaseRelationReference =>
	immutableRecord({
		fieldPath: immutableArray([predicate.field]),
		source: predicate.source.definition,
		target: predicate.target.definition,
	})

/** Expands application-owned relation scopes without rewriting caller Query nodes. */
class RuntimeRelationPredicatePreparer {
	readonly #context: RequestContext
	readonly #initialScopes: ReadonlyMap<
		QueryRelationFilterNode,
		DatabaseRelationPredicateScope
	>
	readonly #prepared = new Map<
		QueryRelationFilterNode,
		DatabaseRelationPredicateScope
	>()
	readonly #ordered: DatabaseRelationPredicateScope[] = []
	readonly #activeDeclarations = new Set<object>()
	readonly #contributions
	readonly #runtime
	readonly #resolver: RuntimeRelationFilterResolver

	constructor(
		application: RelationFilterApplication,
		resolver: RuntimeRelationFilterResolver,
		input: RuntimeRelationPredicatePreparationInput,
	) {
		this.#context = input.context
		this.#resolver = resolver
		this.#contributions = readEnforcementContributions(application)
		this.#runtime = getApplicationRuntimeCallbackExecutor(application)
		this.#initialScopes = new Map(
			(input.relationPredicates ?? []).map((scope) => [scope.predicate, scope]),
		)
	}

	async prepare(
		input: RuntimeRelationPredicatePreparationInput,
	): Promise<readonly DatabaseRelationPredicateScope[] | undefined> {
		const executable = input.operation as unknown as ExecutableOperationAst

		for (const query of readOperationQueries(executable)) {
			if (query.where !== undefined) {
				await this.#visitExpression(
					query.where.expression,
					0,
					'caller',
					input.operation,
				)
			}
		}

		if (input.rowFilter !== undefined) {
			await this.#visitExpression(
				input.rowFilter,
				0,
				'trusted',
				input.operation,
			)
		}

		for (const scope of this.#initialScopes.values()) {
			if (!this.#prepared.has(scope.predicate)) {
				await this.#visitPredicate(
					scope.predicate,
					1,
					'trusted',
					input.operation,
				)
			}
		}

		return this.#ordered.length === 0
			? undefined
			: immutableArray(this.#ordered)
	}

	async #visitExpression(
		expression: QueryExpressionNode,
		depth: number,
		origin: PredicateOrigin,
		sourceOperation: DatabaseOperationAst,
	): Promise<void> {
		for (const predicate of collectDirectRelationPredicates(expression)) {
			await this.#visitPredicate(predicate, depth + 1, origin, sourceOperation)
		}
	}

	async #visitPredicate(
		predicate: QueryRelationFilterNode,
		depth: number,
		origin: PredicateOrigin,
		sourceOperation: DatabaseOperationAst,
	): Promise<void> {
		if (depth > queryRelationPredicateMaxDepth) {
			throw createQueryRelationDepthError()
		}

		const relation = isCollectionPredicate(predicate)
			? createRelationReference(predicate)
			: undefined
		const relationField =
			relation === undefined
				? undefined
				: readRelationWhereField(relation.source, relation.fieldPath)

		if (
			relationField !== undefined &&
			this.#activeDeclarations.has(relationField)
		) {
			throw createQueryRelationDepthError()
		}

		this.#resolver.consumePredicateOccurrence()

		if (this.#prepared.has(predicate)) return

		const initialScope = this.#initialScopes.get(predicate)
		const includesCallerFilter =
			origin === 'caller' &&
			!(
				isQueryRelationCountNode(predicate) &&
				predicate.expression.kind === 'constant' &&
				predicate.expression.value
			)
		const targetOperation = createRelationPredicateTargetOperation(
			predicate,
			includesCallerFilter,
		)
		let constraints = initialScope?.constraints ?? immutableArray([])
		let policyRowFilter = initialScope?.rowFilter

		if (initialScope === undefined && this.#contributions.length > 0) {
			if (origin === 'caller') {
				await enforceProtectedRelation(
					this.#contributions,
					immutableRecord({
						context: this.#context,
						operation: sourceOperation,
						relation: createRelationReference(predicate),
					}),
				)
			}

			const targetState = await evaluateEnforcementContributions(
				this.#contributions,
				this.#runtime,
				immutableRecord({
					context: this.#context,
					operation: targetOperation,
				}),
				createEnforcementState(),
			)
			const targetSnapshot = getEnforcementStateSnapshot(targetState)
			constraints = targetSnapshot.constraints
			policyRowFilter = targetSnapshot.rowFilter
		}

		const relationFilter =
			relation === undefined
				? undefined
				: await this.#resolver.resolve(this.#context, targetOperation, relation)
		const rowFilter = combineDatabaseRowFilters(relationFilter, policyRowFilter)
		const scope = immutableRecord({
			constraints,
			predicate,
			...(rowFilter === undefined ? {} : { rowFilter }),
		})
		this.#prepared.set(predicate, scope)
		this.#ordered.push(scope)

		await this.#visitExpression(
			predicate.expression,
			depth,
			origin,
			targetOperation,
		)
		if (policyRowFilter !== undefined) {
			await this.#visitExpression(
				policyRowFilter,
				depth,
				'trusted',
				targetOperation,
			)
		}

		if (relationFilter !== undefined && relationField !== undefined) {
			this.#activeDeclarations.add(relationField)
			try {
				await this.#visitExpression(
					relationFilter,
					depth,
					'trusted',
					targetOperation,
				)
			} finally {
				this.#activeDeclarations.delete(relationField)
			}
		}
	}
}

/** Prepares every relation leaf and its request-local declared target filter. */
export const prepareRuntimeRelationPredicates = async (
	application: RelationFilterApplication,
	resolver: RuntimeRelationFilterResolver,
	input: RuntimeRelationPredicatePreparationInput,
): Promise<readonly DatabaseRelationPredicateScope[] | undefined> =>
	new RuntimeRelationPredicatePreparer(application, resolver, input).prepare(
		input,
	)
