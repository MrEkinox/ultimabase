import { isPlainRecord } from '@ultimabase/shared'

import { FrameworkError } from '../../foundation.js'
import {
	collectQueryRelationPredicates,
	isQueryRelationCountNode,
	isQueryRelationPredicateNode,
} from '../../query/filters/relation.js'
import type { QueryFilterExpression } from '../../query/filters/logical.js'
import { resolveQueryTarget } from '../../query/filters/target.js'
import {
	getPluginFieldStructuralContains,
	Schema,
	type SchemaDefinition,
} from '../../schema/index.js'
import { isRelationUpdateExpression } from '../../schema/relations/mutation.js'
import {
	databasePluginFieldStructuralContainsCapabilityVersion,
	databaseRelationCapabilityVersion,
	databaseRelationPredicateCapabilityVersion,
	type DatabaseInclusionPlan,
	type DatabaseOperationAst,
	type DatabaseOperationExecutor,
	type DatabaseRelationPredicateScope,
	type DatabaseRelationScope,
	type DatabaseRowFilterNode,
} from '../database/contracts.js'
import { readOperationQueries } from '../operations/queries.js'
import { getOperationSchema } from '../operations/schema.js'
import { assertDatabaseFilterOperators } from './filter-operator-validation.js'
import { assertDatabaseInclusionCapability } from './mutation-inclusion-source.js'

interface DatabaseCapabilityRequest {
	readonly inclusions?: readonly DatabaseInclusionPlan[]
	readonly operation: DatabaseOperationAst
	readonly relation?: DatabaseRelationScope
	readonly relationPredicates?: readonly DatabaseRelationPredicateScope[]
	readonly rowFilter?: DatabaseRowFilterNode
}

const containsPluginFieldOperand = (
	schema: SchemaDefinition,
	expression: QueryFilterExpression,
): boolean => {
	if (
		(expression.kind === 'and' || expression.kind === 'or') &&
		'expressions' in expression
	) {
		return expression.expressions.some((child) =>
			containsPluginFieldOperand(schema, child),
		)
	}

	if (expression.kind === 'not' && 'expression' in expression) {
		return containsPluginFieldOperand(schema, expression.expression)
	}

	if (
		isQueryRelationPredicateNode(expression) ||
		isQueryRelationCountNode(expression)
	) {
		return containsPluginFieldOperand(
			expression.target.definition,
			expression.expression,
		)
	}

	if (
		expression.kind !== 'contains' ||
		!('field' in expression) ||
		typeof expression.field !== 'string'
	) {
		return false
	}

	const target =
		'path' in expression && Array.isArray(expression.path)
			? {
					kind: 'field-path' as const,
					field: expression.field,
					path: expression.path,
				}
			: expression.field
	const field = resolveQueryTarget(schema, target).terminalField

	return (
		field !== undefined && getPluginFieldStructuralContains(field) !== undefined
	)
}

/** Requires one exact versioned adapter capability before the first adapter effect. */
const assertCapability = (
	executor: DatabaseOperationExecutor,
	key: 'pluginFieldStructuralContains' | 'relationPredicates' | 'relations',
	kind: string,
	version: number,
	name: string,
	publicMessage: string,
): void => {
	const capability: unknown = executor.capabilities?.[key]

	if (
		!isPlainRecord(capability) ||
		capability.kind !== kind ||
		capability.version !== version
	) {
		throw new FrameworkError(
			'INTERNAL_ERROR',
			`Database adapter must implement ${name} capability version ${String(version)}.`,
			{ publicMessage },
		)
	}
}

const assertRelationCapability = (
	executor: DatabaseOperationExecutor,
	publicMessage: string,
): void => {
	assertCapability(
		executor,
		'relations',
		'relations',
		databaseRelationCapabilityVersion,
		'relation',
		publicMessage,
	)
}

/** Rejects every unsupported request feature before the first adapter effect. */
export const assertDatabaseRequestCapabilities = (
	executor: DatabaseOperationExecutor,
	request: DatabaseCapabilityRequest,
): void => {
	const { operation, rowFilter } = request
	assertDatabaseFilterOperators(executor, request)

	if (
		operation.kind === 'update-one' &&
		'update' in operation &&
		isRelationUpdateExpression(operation.update)
	) {
		assertRelationCapability(executor, 'Relation mutations are not available.')
	}

	const queries = readOperationQueries(operation)
	const operationSchema = getOperationSchema(operation)
	const rootSchema = Schema.is(operationSchema) ? operationSchema : undefined
	if (
		queries.some(
			(query) =>
				query.where !== undefined &&
				containsPluginFieldOperand(
					query.schema.definition,
					query.where.expression,
				),
		) ||
		(rowFilter !== undefined &&
			rootSchema !== undefined &&
			containsPluginFieldOperand(rootSchema, rowFilter))
	) {
		assertCapability(
			executor,
			'pluginFieldStructuralContains',
			'plugin-field-structural-contains',
			databasePluginFieldStructuralContainsCapabilityVersion,
			'plugin field structural containment',
			'Plugin field containment filters are not available.',
		)
	}

	if (request.inclusions !== undefined) {
		assertDatabaseInclusionCapability(executor)
	}

	if (request.relation !== undefined) {
		assertRelationCapability(executor, 'Relation queries are not available.')
	}

	const predicates = [
		...queries.flatMap((query) =>
			query.where === undefined
				? []
				: [...collectQueryRelationPredicates(query.where.expression)],
		),
		...(rowFilter === undefined
			? []
			: [...collectQueryRelationPredicates(rowFilter)]),
	]

	if (predicates.length === 0) return

	assertCapability(
		executor,
		'relationPredicates',
		'relation-predicates',
		databaseRelationPredicateCapabilityVersion,
		'relation predicate',
		'Relation filters are not available.',
	)

	if (
		predicates.some(
			(predicate) =>
				!request.relationPredicates?.some(
					(scope) => scope.predicate === predicate,
				),
		)
	) {
		throw new FrameworkError(
			'INTERNAL_ERROR',
			'Relation predicate target policy was not evaluated.',
			{ publicMessage: 'Relation filters are not available.' },
		)
	}
}
