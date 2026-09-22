import { Schema, type SchemaDefinition } from '../../schema/index.js'
import { getFieldSchemaTarget } from '../../schema/fields/base/definition.js'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type {
	QueryAst,
	QueryFieldName,
	QueryInclusionNode,
	QueryWhereNode,
} from '../ast/contracts.js'
import { createQueryAst } from '../ast/factory.js'
import { parsePersistedQueryFieldName as parseQueryFieldName } from '../ast/schema.js'
import type { QuerySelection } from '../clauses/selection.js'
import {
	normalizeQuerySelectedFields,
	normalizeQuerySelection,
} from '../clauses/selection.js'
import type {
	QueryIncludableFieldName,
	QueryInclusionAst,
	QueryInclusionInput,
} from '../clauses/inclusion.js'
import { normalizeQueryInclusion } from '../clauses/inclusion.js'
import {
	normalizeQueryLimit,
	normalizeQueryOffsetPagination,
} from '../clauses/pagination.js'
import {
	normalizeQueryOrdering,
	type QueryOrderInput,
} from '../clauses/ordering.js'
import type { QueryFilterNode } from '../filters/logical.js'
import { resolveWhereInput, type WhereInput } from '../filters/where.js'
import type { OperationObjectId } from '../operations/contracts.js'
import type {
	CountInput,
	ExistsInput,
	FindManyInput,
	FindOneInput,
	GetInput,
	QueryIncludedFieldFromInput,
	QuerySelectedFieldFromInput,
} from './input-contracts.js'

export type {
	CountInput,
	ExactGeneratedFindManyInput,
	ExactGeneratedFindOneInput,
	ExactGeneratedGetInput,
	ExactGeneratedInclusionInput,
	ExactReadInput,
	ExistsInput,
	FindManyInput,
	FindOneInput,
	GetInput,
	QueryBuilderInput,
	QueryIncludeInput,
	QueryIncludedFieldFromInput,
	QueryOrderByDirection,
	QueryOrderByInput,
	QueryPointerTargetInput,
	QueryRelationTargetInput,
	QuerySelectedFieldFromInput,
} from './input-contracts.js'

type QueryInputInclusion<TSchema extends SchemaDefinition> = [
	QueryIncludableFieldName<TSchema>,
] extends [never]
	? QueryInclusionNode<QueryFieldName<TSchema>>
	: QueryInclusionAst<TSchema>

type QueryInputAst<TSchema extends SchemaDefinition> = QueryAst<
	TSchema,
	QueryFilterNode<TSchema>,
	QueryInputInclusion<TSchema>
>

declare const normalizedQueryInputType: unique symbol

/** @internal Carries exact result inference beside one directly normalized AST. */
export interface NormalizedQueryInput<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema> = never,
	TIncludedField = never,
> {
	readonly ast: QueryInputAst<TSchema>
	readonly schema: TSchema
	readonly [normalizedQueryInputType]?: Readonly<{
		readonly includedField: TIncludedField
		readonly selectedField: TSelectedField
	}>
}

type QueryInputKind =
	| 'count'
	| 'exists'
	| 'find-many'
	| 'find-one'
	| 'get'
	| 'pointer-target'
	| 'relation-target'

const queryInputKeys: Readonly<Record<QueryInputKind, ReadonlySet<string>>> =
	immutableRecord({
		count: new Set(['where']),
		exists: new Set(['where']),
		'find-many': new Set([
			'include',
			'limit',
			'orderBy',
			'select',
			'offset',
			'where',
		]),
		'find-one': new Set(['include', 'orderBy', 'select', 'where']),
		get: new Set(['id', 'include', 'select']),
		'pointer-target': new Set(['include', 'select']),
		'relation-target': new Set([
			'include',
			'limit',
			'offset',
			'orderBy',
			'select',
			'where',
		]),
	})

const assertQueryInput: (
	input: unknown,
	kind: QueryInputKind,
) => asserts input is Readonly<Record<string, unknown>> = (input, kind) => {
	if (!isPlainRecord(input)) {
		throw new TypeError(`${kind} input must be an object`)
	}

	const allowedKeys = queryInputKeys[kind]

	for (const key of Object.keys(input)) {
		if (!allowedKeys.has(key)) {
			throw new TypeError(`${kind} input contains an unknown clause: ${key}`)
		}
	}
}

const applyQueryOrdering = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	ast: QueryInputAst<TSchema>,
	input: unknown,
): QueryInputAst<TSchema> => {
	if (!isPlainRecord(input)) {
		throw new TypeError('query.orderBy must be an object')
	}

	const orders: QueryOrderInput<QueryFieldName<TSchema>>[] = []

	for (const [fieldName, direction] of Object.entries(input)) {
		if (direction === null) {
			parseQueryFieldName(schema, fieldName, `query.orderBy.${fieldName}`)
			continue
		}

		if (direction !== 'asc' && direction !== 'desc') {
			throw new TypeError(
				`query.orderBy.${fieldName} must be asc, desc, or null`,
			)
		}

		orders.push({
			direction:
				direction === 'asc' ? ('ascending' as const) : ('descending' as const),
			field: fieldName,
		})
	}

	return immutableRecord({
		...ast,
		ordering: normalizeQueryOrdering(schema, orders),
	})
}

const applyQueryProjection = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	ast: QueryInputAst<TSchema>,
	input: Readonly<Record<string, unknown>>,
): QueryInputAst<TSchema> => {
	let selection = ast.selection
	const fields = schema.persistedFields
	if (input.select !== undefined) {
		selection = normalizeQuerySelection(
			schema,
			input.select as QuerySelection<TSchema>,
		)
	}

	if (input.include === undefined) {
		return immutableRecord({ ...ast, selection })
	}

	if (!isPlainRecord(input.include)) {
		throw new TypeError('query.include must be an object')
	}

	const inclusions: QueryInclusionInput<TSchema>[] = []

	for (const [fieldName, targetInput] of Object.entries(input.include)) {
		if (!isPlainRecord(targetInput)) {
			throw new TypeError(`query.include.${fieldName} must be an object`)
		}

		const field = fields[fieldName]

		if (field?.kind !== 'pointer' && field?.kind !== 'relation') {
			throw new TypeError(
				'query inclusion field must reference a pointer or relation field',
			)
		}

		const target = getFieldSchemaTarget(field)?.()

		if (!Schema.is(target)) {
			throw new TypeError(
				'query inclusion target must be created by Schema.define',
			)
		}

		const includedField = fieldName as QueryIncludableFieldName<TSchema>
		const targetQuery = createInputQuery(
			target,
			targetInput,
			field.kind === 'pointer' ? 'pointer-target' : 'relation-target',
		)

		// Runtime target identity and the pointer field were validated together above;
		// this boundary only restores their compile-time correlation after iteration.
		inclusions.push({
			field: includedField,
			query: targetQuery.ast,
		} as unknown as QueryInclusionInput<TSchema>)
	}

	const selectionFields = selection.fields.map(({ field }) => field)
	const includedSelection =
		selectionFields.length === 0
			? selection
			: normalizeQuerySelectedFields(schema, [
					...selectionFields,
					...inclusions
						.filter(({ field }) => fields[field].kind === 'pointer')
						.map(({ field }) => field),
				])

	return immutableRecord({
		...ast,
		inclusion: normalizeQueryInclusion(schema, inclusions),
		selection: includedSelection,
	})
}

const createNormalizedQueryInput = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	ast: QueryInputAst<TSchema>,
): NormalizedQueryInput<TSchema> => immutableRecord({ ast, schema })

const applyQueryWhere = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	ast: QueryInputAst<TSchema>,
	input: Readonly<Record<string, unknown>>,
): QueryInputAst<TSchema> => {
	if (input.where === undefined) {
		return ast
	}

	const where: QueryWhereNode<QueryFilterNode<TSchema>> = immutableRecord({
		expression: resolveWhereInput(schema, input.where as WhereInput<TSchema>),
		kind: 'where',
	})

	return immutableRecord({ ...ast, where })
}

const createInputQuery = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: Readonly<Record<string, unknown>>,
	kind: QueryInputKind,
): NormalizedQueryInput<TSchema> => {
	const untrustedSchema: unknown = schema

	if (!Schema.is(untrustedSchema)) {
		throw new TypeError('read input schema must be created by Schema.define')
	}

	assertQueryInput(input, kind)

	let ast = createQueryAst(schema) as QueryInputAst<TSchema>

	ast = applyQueryWhere(schema, ast, input)
	ast = applyQueryProjection(schema, ast, input)

	if (input.orderBy !== undefined) {
		ast = applyQueryOrdering(schema, ast, input.orderBy)
	}

	if (input.limit !== undefined) {
		ast = immutableRecord({
			...ast,
			limit: normalizeQueryLimit(input.limit as number),
		})
	}

	if (input.offset !== undefined) {
		ast = immutableRecord({
			...ast,
			pagination: normalizeQueryOffsetPagination({
				offset: input.offset as number,
			}),
		})
	}

	return createNormalizedQueryInput(schema, ast)
}

/** Normalizes one collection object directly into the immutable Query AST. */
export const queryFromFindManyInput = <
	const TSchema extends SchemaDefinition,
	const TInput extends FindManyInput<TSchema>,
>(
	schema: TSchema,
	input: TInput,
): NormalizedQueryInput<
	TSchema,
	QuerySelectedFieldFromInput<TSchema, TInput>,
	QueryIncludedFieldFromInput<TSchema, TInput>
> =>
	createInputQuery(
		schema,
		input as unknown as Readonly<Record<string, unknown>>,
		'find-many',
	)

/** Normalizes one first-match object directly into the immutable Query AST. */
export const queryFromFindOneInput = <
	const TSchema extends SchemaDefinition,
	const TInput extends FindOneInput<TSchema>,
>(
	schema: TSchema,
	input: TInput,
): NormalizedQueryInput<
	TSchema,
	QuerySelectedFieldFromInput<TSchema, TInput>,
	QueryIncludedFieldFromInput<TSchema, TInput>
> =>
	createInputQuery(
		schema,
		input as unknown as Readonly<Record<string, unknown>>,
		'find-one',
	)

/** Normalizes one identifier input and returns its separately retained ID. */
export const queryFromGetInput = <
	const TSchema extends SchemaDefinition,
	const TInput extends GetInput<TSchema>,
>(
	schema: TSchema,
	input: TInput,
): Readonly<{
	readonly id: OperationObjectId<TSchema>
	readonly query: NormalizedQueryInput<
		TSchema,
		QuerySelectedFieldFromInput<TSchema, TInput>,
		QueryIncludedFieldFromInput<TSchema, TInput>
	>
}> => {
	const query = createInputQuery(
		schema,
		input as unknown as Readonly<Record<string, unknown>>,
		'get',
	)
	const untrustedId: unknown = input.id

	if (typeof untrustedId !== 'string') {
		throw new TypeError('get input id must be a string')
	}

	return immutableRecord({
		id: input.id,
		query,
	})
}

/** Normalizes one filtered count input. */
export const queryFromCountInput = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: CountInput<TSchema>,
): NormalizedQueryInput<TSchema> =>
	createInputQuery(
		schema,
		input as unknown as Readonly<Record<string, unknown>>,
		'count',
	)

/** Normalizes one filtered existence input. */
export const queryFromExistsInput = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: ExistsInput<TSchema>,
): NormalizedQueryInput<TSchema> =>
	createInputQuery(
		schema,
		input as unknown as Readonly<Record<string, unknown>>,
		'exists',
	)
