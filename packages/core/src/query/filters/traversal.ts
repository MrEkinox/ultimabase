import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'

import type { QueryExpressionNode } from '../ast/contracts.js'

type GuardedQueryExpressionNode = QueryExpressionNode &
	Readonly<Record<string, unknown>>

type QueryExpressionTraversalDirective = 'continue' | 'skip' | 'target'

type QueryExpressionVisitor = (
	expression: GuardedQueryExpressionNode,
	targetDepth: number,
) => QueryExpressionTraversalDirective

const isQueryExpressionRecord = (
	value: unknown,
): value is GuardedQueryExpressionNode =>
	isPlainRecord(value) && typeof value.kind === 'string'

/**
 * Traverses the current Query expression containers after guarding every node.
 * Callers keep ownership of relation boundaries instead of teaching this
 * internal structural walk about concrete leaf kinds.
 */
export const traverseQueryExpression = (
	expression: unknown,
	visitor: QueryExpressionVisitor,
): void => {
	const ancestors = new WeakSet<object>()

	const traverse = (candidate: unknown, targetDepth: number): void => {
		if (!isQueryExpressionRecord(candidate)) {
			return
		}

		if (ancestors.has(candidate)) {
			throw new TypeError(
				'relation predicate must not contain circular references',
			)
		}

		ancestors.add(candidate)

		try {
			const directive = visitor(candidate, targetDepth)

			if (directive === 'skip') {
				return
			}

			if (directive === 'continue' && isUnknownArray(candidate.expressions)) {
				for (const child of candidate.expressions) {
					traverse(child, targetDepth)
				}
			}

			traverse(
				candidate.expression,
				directive === 'target' ? targetDepth + 1 : targetDepth,
			)
		} finally {
			ancestors.delete(candidate)
		}
	}

	traverse(expression, 1)
}
