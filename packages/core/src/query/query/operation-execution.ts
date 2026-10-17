import type {
	SchemaDefinition,
	SchemaStoredCreateData,
} from '../../schema/index.js'
import { immutableRecord } from '@ultimabase/shared'

import type { QueryFieldName } from '../ast/contracts.js'
import { createQueryAst } from '../ast/factory.js'
import { readWriteSelection } from '../clauses/selection.js'
import type { QueryFilterNode } from '../filters/logical.js'
import type {
	CountOperationAst,
	CreateOneOperationAst,
	DeleteOneOperationAst,
	ExistsOperationAst,
	FindManyOperationAst,
	FindOneOperationAst,
	GetOperationAst,
	OperationAstNode,
	OperationObjectId,
	UpdateOneOperationAst,
	UpsertOneOperationAst,
} from '../operations/contracts.js'
import {
	executeOperation,
	normalizeOperationOptions,
} from '../operations/execution.js'
import type { OperationOptions } from '../operations/options.js'
import type { OperationResult } from '../operations/results.js'
import type { SchemaCreateOneExecutionInput } from '../operations/schema-commands.js'
import {
	markLinkTargetOperation,
	markNestedWriteRootOperation,
	type LinkTargetMarker,
} from '../../schema/nested-writes/operation-markers.js'
import {
	normalizeUniqueUpsertTarget,
	normalizeUpsertInput,
	type UpsertInput,
} from '../operations/upsert.js'
import type {
	UpdateExpression,
	UpdateExpressionInput,
} from '../updates/contracts.js'
import { normalizeUpdateExpression } from '../updates/normalize.js'
import { createProtectedObjectNotFoundError } from '../../runtime/operations/target-errors.js'
import { queryFromFindOneInput } from './input.js'
import {
	readQueryPrivateScope,
	type QueryExecutionInput,
} from './private-scope.js'
import type { QueryResult } from './result.js'

/**
 * Marks a root write whose data names a pointer or relation, so Runtime
 * normalizes and checks its link commands (ADR-0308).
 */
const markNestedWrite = <TOperation extends OperationAstNode>(
	schema: SchemaDefinition,
	operation: TOperation,
	command: 'create' | 'update',
	input: Readonly<Record<string, unknown>>,
): TOperation =>
	Object.entries(schema.persistedFields).some(
		([fieldName, field]) =>
			(field.kind === 'pointer' || field.kind === 'relation') &&
			Object.hasOwn(input, fieldName),
	)
		? markNestedWriteRootOperation(operation, { command, input })
		: operation

/**
 * Executes an internal operation with the protected scope retained by a QueryBuilder.
 *
 * @internal Relation mutations use this bridge so their source identity never
 * enters the transformable operation AST.
 */
export const executeQueryWithPrivateScope = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
	const TOperation extends OperationAstNode,
>(
	query: QueryExecutionInput<TSchema, TSelectedField, TIncludedPointer>,
	operation: TOperation,
	options?: OperationOptions,
): Promise<OperationResult<TOperation>> =>
	executeOperation(
		operation,
		normalizeOperationOptions(options),
		readQueryPrivateScope(query),
	)

/** Executes one collection read while retaining framework-owned private scope. */
export const executeQueryFindMany = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
>(
	query: QueryExecutionInput<TSchema, TSelectedField, TIncludedPointer>,
	options?: OperationOptions,
): Promise<
	readonly QueryResult<TSchema, TSelectedField, TIncludedPointer>[]
> => {
	const operation: FindManyOperationAst<
		TSchema,
		QueryFilterNode<TSchema>,
		TSelectedField,
		TIncludedPointer
	> = immutableRecord({ kind: 'find-many', query: query.ast })

	return executeQueryWithPrivateScope(query, operation, options)
}

/** Executes one first-match read while retaining framework-owned private scope. */
export const executeQueryFindOne = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
>(
	query: QueryExecutionInput<TSchema, TSelectedField, TIncludedPointer>,
	options?: OperationOptions,
): Promise<QueryResult<TSchema, TSelectedField, TIncludedPointer> | null> => {
	const operation: FindOneOperationAst<
		TSchema,
		QueryFilterNode<TSchema>,
		TSelectedField,
		TIncludedPointer
	> = immutableRecord({ kind: 'find-one', query: query.ast })

	return executeQueryWithPrivateScope(query, operation, options)
}

/**
 * Turns the `null` of a first-match read into `NOT_FOUND`, which also hides
 * whether a matching row exists but is not visible (ADR-0307).
 */
export const requireFoundRow = <TResult>(result: TResult | null): TResult => {
	if (result === null) throw createProtectedObjectNotFoundError()
	return result
}

/** Executes one exact identifier read while retaining private QueryBuilder filters. */
export const executeQueryGet = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
>(
	query: QueryExecutionInput<TSchema, TSelectedField, TIncludedPointer>,
	id: OperationObjectId<TSchema>,
	options?: OperationOptions,
): Promise<QueryResult<TSchema, TSelectedField, TIncludedPointer>> => {
	const operation: GetOperationAst<
		TSchema,
		QueryFilterNode<TSchema>,
		TSelectedField,
		TIncludedPointer
	> = immutableRecord({ kind: 'get', id, query: query.ast })

	return executeQueryWithPrivateScope(query, operation, options)
}

/** Executes one filtered count without materializing model values. */
export const executeQueryCount = <const TSchema extends SchemaDefinition>(
	query: QueryExecutionInput<TSchema, never, never>,
	options?: OperationOptions,
): Promise<number> => {
	const operation: CountOperationAst<
		TSchema,
		QueryFilterNode<TSchema>
	> = immutableRecord({ kind: 'count', query: query.ast })

	return executeQueryWithPrivateScope(query, operation, options)
}

/** Executes one filtered existence check without loading model values. */
export const executeQueryExists = <const TSchema extends SchemaDefinition>(
	query: QueryExecutionInput<TSchema, never, never>,
	options?: OperationOptions,
): Promise<boolean> => {
	const operation: ExistsOperationAst<
		TSchema,
		QueryFilterNode<TSchema>
	> = immutableRecord({ kind: 'exists', query: query.ast })

	return executeQueryWithPrivateScope(query, operation, options)
}

/** Executes one schema-owned create command without inventing a meaningless QueryBuilder. */
export const executeSchemaCreateOne = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: SchemaCreateOneExecutionInput<TSchema>,
	options?: OperationOptions,
): Promise<object> => {
	const projection = queryFromFindOneInput(schema, {
		...(input.include === undefined ? {} : { include: input.include }),
		select: readWriteSelection(input.select),
	})
	const operation: CreateOneOperationAst<
		TSchema,
		QueryFieldName<TSchema>
	> = immutableRecord({
		kind: 'create-one',
		schema: createQueryAst(schema).schema,
		// Runtime replaces linked data with its stored Pointers (ADR-0308).
		input: input.data as SchemaStoredCreateData<TSchema>,
		inclusion: projection.ast.inclusion,
		selection: projection.ast.selection,
	})

	return executeOperation(
		markNestedWrite(schema, operation, 'create', input.data),
		normalizeOperationOptions(options),
	)
}

/** Executes one singular update while retaining private QueryBuilder restrictions. */
export const executeQueryUpdateOne = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
>(
	query: QueryExecutionInput<TSchema, TSelectedField, TIncludedPointer>,
	input: UpdateExpressionInput<TSchema> & {},
	options?: OperationOptions,
): Promise<QueryResult<TSchema, TSelectedField, TIncludedPointer> | null> => {
	const operation: UpdateOneOperationAst<
		TSchema,
		UpdateExpression<TSchema>,
		QueryFilterNode<TSchema>,
		TSelectedField,
		TIncludedPointer
	> = immutableRecord({
		kind: 'update-one',
		query: query.ast,
		update: normalizeUpdateExpression(query.schema, input),
	})

	return executeQueryWithPrivateScope(
		query,
		markNestedWrite(
			query.schema,
			operation,
			'update',
			input as Readonly<Record<string, unknown>>,
		),
		options,
	)
}

/** Executes one unique-target upsert while retaining private QueryBuilder restrictions. */
export const executeQueryUpsertOne = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
>(
	query: QueryExecutionInput<TSchema, TSelectedField, TIncludedPointer>,
	input: UpsertInput<TSchema> & {},
	options?: OperationOptions,
	links: readonly LinkTargetMarker[] = [],
): Promise<QueryResult<TSchema, TSelectedField, TIncludedPointer>> => {
	const normalizedInput = normalizeUpsertInput(query.schema, input)
	const operation: UpsertOneOperationAst<
		TSchema,
		UpdateExpression<TSchema>,
		QueryFilterNode<TSchema>,
		TSelectedField,
		TIncludedPointer
	> = immutableRecord({
		kind: 'upsert-one',
		query: query.ast,
		target: normalizeUniqueUpsertTarget(query.schema, query.ast),
		...normalizedInput,
	})

	return executeQueryWithPrivateScope(
		query,
		markLinkTargetOperation(operation, links),
		options,
	)
}

/** Executes one singular delete while retaining private QueryBuilder restrictions. */
export const executeQueryDeleteOne = <
	const TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
>(
	query: QueryExecutionInput<TSchema, TSelectedField, TIncludedPointer>,
	options?: OperationOptions,
): Promise<QueryResult<TSchema, TSelectedField, TIncludedPointer> | null> => {
	const operation: DeleteOneOperationAst<
		TSchema,
		QueryFilterNode<TSchema>,
		TSelectedField,
		TIncludedPointer
	> = immutableRecord({ kind: 'delete-one', query: query.ast })

	return executeQueryWithPrivateScope(query, operation, options)
}
