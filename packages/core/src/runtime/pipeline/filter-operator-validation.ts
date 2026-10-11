import { readApplicationLog } from '../../application/application-kernel-state.js'
import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'

import { FrameworkError } from '../../foundation.js'
import { readWhereOperatorKey } from '../../query/filters/primitive.js'
import {
	isQueryRelationCountNode,
	isQueryRelationPredicateNode,
} from '../../query/filters/relation.js'
import { resolveQueryTarget } from '../../query/filters/target.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
import {
	readDatabaseFilterOperatorFamily,
	readDeclaredFilterOperators,
} from '../database/adapter-capabilities.js'
import type {
	DatabaseInclusionPlan,
	DatabaseOperationAst,
	DatabaseOperationExecutor,
	DatabaseRelationPredicateScope,
	DatabaseRowFilterNode,
} from '../database/contracts.js'
import { readOperationQueries } from '../operations/queries.js'
import { getOperationSchema } from '../operations/schema.js'

/** Logical containers walked by the check; leaves are tested individually. */
const logicalKinds = new Set(['and', 'or', 'not', 'constant'])

interface UnsupportedFilterOperator {
	readonly field: string
	readonly operator: string
	readonly schema: string
}

/** Names one leaf with its public `where` key (`isNull`, `startsWith`, ...). */
const readPublicOperator = (leaf: Readonly<Record<string, unknown>>): string =>
	leaf.kind === 'null'
		? leaf.isNull === false
			? 'isNotNull'
			: 'isNull'
		: readWhereOperatorKey(String(leaf.kind))

/** Finds the first leaf whose operator the adapter does not declare. */
const findUnsupported = (
	executor: DatabaseOperationExecutor,
	schema: SchemaDefinition,
	expression: unknown,
): UnsupportedFilterOperator | undefined => {
	if (!isPlainRecord(expression) || typeof expression.kind !== 'string') {
		return undefined
	}
	if (
		isQueryRelationPredicateNode(expression) ||
		isQueryRelationCountNode(expression)
	) {
		return findUnsupported(
			executor,
			expression.target.definition,
			expression.expression,
		)
	}
	if (logicalKinds.has(expression.kind)) {
		const children: unknown[] = isUnknownArray(expression.expressions)
			? [...expression.expressions]
			: [expression.expression]
		for (const child of children) {
			const found = findUnsupported(executor, schema, child)
			if (found !== undefined) return found
		}
		return undefined
	}
	if (typeof expression.field !== 'string') return undefined
	const target = isUnknownArray(expression.path)
		? { kind: 'field-path', field: expression.field, path: expression.path }
		: expression.field
	const family = readDatabaseFilterOperatorFamily(
		resolveQueryTarget(schema, target).terminalField,
	)
	// Plugin fields keep their own versioned containment capability.
	if (family === undefined) return undefined
	return readDeclaredFilterOperators(executor.capabilities, family).includes(
		expression.kind,
	)
		? undefined
		: {
				field: expression.field,
				operator: readPublicOperator(expression),
				schema: schema.className,
			}
}

const callerError = (
	unsupported: UnsupportedFilterOperator,
): FrameworkError<'VALIDATION_ERROR'> =>
	new FrameworkError(
		'VALIDATION_ERROR',
		`Database adapter does not support filter operator ${unsupported.operator} on ${unsupported.schema}.${unsupported.field}.`,
		{
			publicMessage: `The filter operator ${unsupported.operator} is not supported on field ${unsupported.field}.`,
			publicDetails: {
				field: unsupported.field,
				operator: unsupported.operator,
			},
			internalDetails: { kind: 'filter-operator-unsupported' },
		},
	)

/** Keeps protected policy details out of the response and in the server log. */
const protectedError = (
	unsupported: UnsupportedFilterOperator,
): FrameworkError<'VALIDATION_ERROR'> => {
	const internalDetails = {
		kind: 'protected-filter-operator-unsupported',
		...unsupported,
	}
	readApplicationLog().error(
		'UltimaBase: a protected filter uses an operator the database adapter does not declare',
		internalDetails,
	)
	return new FrameworkError(
		'VALIDATION_ERROR',
		`Database adapter does not support protected filter operator ${unsupported.operator} on ${unsupported.schema}.${unsupported.field}.`,
		{
			publicMessage: 'The request cannot be evaluated by the database.',
			internalDetails,
		},
	)
}

interface FilterOperatorRequest {
	readonly inclusions?: readonly DatabaseInclusionPlan[]
	readonly operation: DatabaseOperationAst
	readonly relationPredicates?: readonly DatabaseRelationPredicateScope[]
	readonly rowFilter?: DatabaseRowFilterNode
}

/**
 * Validates every filter operator against the adapter's declaration before the
 * adapter is reached (ADR-0301): caller filters fail with a public
 * `VALIDATION_ERROR` naming the field and operator; protected filters (Access
 * rules, plugin constraints) fail with the same code and a generic message.
 */
export const assertDatabaseFilterOperators = (
	executor: DatabaseOperationExecutor,
	request: FilterOperatorRequest,
): void => {
	for (const query of readOperationQueries(request.operation)) {
		const unsupported = findUnsupported(
			executor,
			query.schema.definition,
			query.where?.expression,
		)
		if (unsupported !== undefined) throw callerError(unsupported)
	}
	const schema = getOperationSchema(request.operation)
	const protectedFilters = [
		...(request.rowFilter === undefined || !Schema.is(schema)
			? []
			: [{ schema, filter: request.rowFilter }]),
		...(request.relationPredicates ?? []).flatMap((scope) =>
			scope.rowFilter === undefined
				? []
				: [
						{
							schema: scope.predicate.target.definition,
							filter: scope.rowFilter,
						},
					],
		),
	]
	for (const { filter, schema: target } of protectedFilters) {
		const unsupported = findUnsupported(executor, target, filter)
		if (unsupported !== undefined) throw protectedError(unsupported)
	}
	for (const inclusion of request.inclusions ?? []) {
		assertDatabaseFilterOperators(executor, inclusion.request)
	}
}
