import { isPlainRecord } from '@ultimabase/shared'

import { FrameworkError } from '../../foundation.js'
import { collectQueryRelationPredicates } from '../../query/filters/relation.js'
import {
	isQueryRelationCountNode,
	isQueryRelationPredicateNode,
} from '../../query/filters/relation.js'
import type { QueryFilterExpression } from '../../query/filters/logical.js'
import { resolveQueryTarget } from '../../query/filters/target.js'
import type { ExecutableOperationAst } from '../../query/index.js'
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
import { assertDatabaseInclusionCapability } from './inclusion-projection.js'

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

const assertPluginFieldStructuralContainsCapability = (
	executor: DatabaseOperationExecutor,
	request: DatabaseCapabilityRequest,
): void => {
	const executable = request.operation as unknown as ExecutableOperationAst
	const queries = readOperationQueries(executable)
	const operationSchema = getOperationSchema(executable)
	const rootSchema = Schema.is(operationSchema) ? operationSchema : undefined
	const requiresCapability =
		queries.some(
			(query) =>
				query.where !== undefined &&
				containsPluginFieldOperand(
					query.schema.definition,
					query.where.expression,
				),
		) ||
		(request.rowFilter !== undefined &&
			rootSchema !== undefined &&
			containsPluginFieldOperand(rootSchema, request.rowFilter))

	if (!requiresCapability) return

	const capability: unknown =
		executor.capabilities?.pluginFieldStructuralContains

	if (
		!isPlainRecord(capability) ||
		capability.kind !== 'plugin-field-structural-contains' ||
		capability.version !==
			databasePluginFieldStructuralContainsCapabilityVersion
	) {
		throw new FrameworkError(
			'INTERNAL_ERROR',
			`Database adapter must implement plugin field structural containment capability version ${String(databasePluginFieldStructuralContainsCapabilityVersion)}.`,
			{ publicMessage: 'Plugin field containment filters are not available.' },
		)
	}
}

const assertRelationMutationCapability = (
	executor: DatabaseOperationExecutor,
	operation: DatabaseOperationAst,
): void => {
	if (
		operation.kind !== 'update-one' ||
		!('update' in operation) ||
		!isRelationUpdateExpression(operation.update)
	) {
		return
	}

	const capability: unknown = executor.capabilities?.relations

	if (
		!isPlainRecord(capability) ||
		capability.kind !== 'relations' ||
		capability.version !== databaseRelationCapabilityVersion
	) {
		throw new FrameworkError(
			'INTERNAL_ERROR',
			`Database adapter must implement relation capability version ${String(databaseRelationCapabilityVersion)}.`,
			{ publicMessage: 'Relation mutations are not available.' },
		)
	}
}

/** Rejects every unsupported request feature before the first adapter effect. */
export const assertDatabaseRequestCapabilities = (
	executor: DatabaseOperationExecutor,
	request: DatabaseCapabilityRequest,
): void => {
	assertRelationMutationCapability(executor, request.operation)
	assertPluginFieldStructuralContainsCapability(executor, request)

	if (request.inclusions !== undefined) {
		assertDatabaseInclusionCapability(executor)
	}

	if (request.relation !== undefined) {
		const capability: unknown = executor.capabilities?.relations

		if (
			!isPlainRecord(capability) ||
			capability.kind !== 'relations' ||
			capability.version !== databaseRelationCapabilityVersion
		) {
			throw new FrameworkError(
				'INTERNAL_ERROR',
				`Database adapter must implement relation capability version ${String(databaseRelationCapabilityVersion)}.`,
				{ publicMessage: 'Relation queries are not available.' },
			)
		}
	}

	const executable = request.operation as unknown as ExecutableOperationAst
	const predicates = [
		...readOperationQueries(executable).flatMap((query) =>
			query.where === undefined
				? []
				: [...collectQueryRelationPredicates(query.where.expression)],
		),
		...(request.rowFilter === undefined
			? []
			: [...collectQueryRelationPredicates(request.rowFilter)]),
	]

	if (predicates.length === 0) return

	const capability: unknown = executor.capabilities?.relationPredicates

	if (
		!isPlainRecord(capability) ||
		capability.kind !== 'relation-predicates' ||
		capability.version !== databaseRelationPredicateCapabilityVersion
	) {
		throw new FrameworkError(
			'INTERNAL_ERROR',
			`Database adapter must implement relation predicate capability version ${String(databaseRelationPredicateCapabilityVersion)}.`,
			{ publicMessage: 'Relation filters are not available.' },
		)
	}

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
