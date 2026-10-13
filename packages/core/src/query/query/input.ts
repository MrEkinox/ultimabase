import { Schema, type SchemaDefinition } from '../../schema/index.js'
import { immutableRecord } from '@ultimabase/shared'
import {
	assertExactEnumerablePlainObject,
	assertPlainObject,
} from '../../exact-object-validation.js'

import type {
	QueryAst,
	QueryFieldName,
	QueryInclusionNode,
	QueryWhereNode,
} from '../ast/contracts.js'
import { createQueryAst } from '../ast/factory.js'
import {
	parsePersistedQueryFieldName as parseQueryFieldName,
	readPersistedQueryFields,
} from '../ast/schema.js'
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
import {
	normalizeQueryInclusion,
	resolveQueryInclusionTarget,
} from '../clauses/inclusion.js'
import {
	normalizeQuerySkipPagination,
	normalizeQueryTake,
} from '../clauses/pagination.js'
import {
	completeQueryOrdering,
	createInvalidPositionError,
	createQueryPositionFilter,
	isOrderableQueryField,
	readRequestedQueryPosition,
} from '../clauses/position.js'
import {
	normalizeQueryOrdering,
	type QueryOrderInput,
} from '../clauses/ordering.js'
import type { QueryFilterNode } from '../filters/logical.js'
import { resolveWhereInput, type WhereInput } from '../filters/where.js'
import { combineWhereExpressions } from '../filters/where-normalize.js'
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
	ExactGeneratedInclusionInput,
	FitsQueryProjection,
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
	QueryPosition,
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
			'after',
			'include',
			'orderBy',
			'select',
			'skip',
			'take',
			'where',
		]),
		'find-one': new Set(['include', 'orderBy', 'select', 'where']),
		get: new Set(['id', 'include', 'select']),
		'pointer-target': new Set(['include', 'select']),
		'relation-target': new Set([
			'after',
			'include',
			'orderBy',
			'select',
			'skip',
			'take',
			'where',
		]),
	})

const assertQueryInput: (
	input: unknown,
	kind: QueryInputKind,
) => asserts input is Readonly<Record<string, unknown>> = (input, kind) => {
	assertExactEnumerablePlainObject(
		input,
		queryInputKeys[kind],
		`${kind} input must be an object`,
		`${kind} input contains an unknown clause: `,
	)
}

/** Names the caller's `orderBy` key when it cannot be ordered. */
const assertOrderableInputField = (
	schema: SchemaDefinition,
	fieldName: string,
): void => {
	const path = `query.orderBy.${fieldName}`
	const field =
		readPersistedQueryFields(schema)[
			parseQueryFieldName(schema, fieldName, path)
		]

	if (field !== undefined && !isOrderableQueryField(field)) {
		throw new TypeError(`${path} must name a non-list scalar or enum field`)
	}
}

/** @internal Normalizes one `orderBy` object; also used by the cursor encoder. */
export const normalizeInputOrdering = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: unknown,
): QueryInputAst<TSchema>['ordering'] => {
	assertPlainObject(input, 'query.orderBy must be an object')

	const orders: QueryOrderInput<QueryFieldName<TSchema>>[] = []

	for (const [fieldName, direction] of Object.entries(input)) {
		if (direction === null) {
			// Null directions are ignored, but still name a real schema field.
			parseQueryFieldName(schema, fieldName, `query.orderBy.${fieldName}`)
		} else if (direction === 'asc' || direction === 'desc') {
			assertOrderableInputField(schema, fieldName)
			orders.push({
				direction: direction === 'asc' ? 'ascending' : 'descending',
				field: fieldName,
			})
		} else {
			throw new TypeError(
				`query.orderBy.${fieldName} must be asc, desc, or null`,
			)
		}
	}

	return normalizeQueryOrdering(schema, orders)
}

/** Normalizes nested target reads and adds included pointers to a narrow selection. */
const normalizeInputInclusion = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: unknown,
	selection: QueryInputAst<TSchema>['selection'],
): Pick<QueryInputAst<TSchema>, 'inclusion' | 'selection'> => {
	assertPlainObject(input, 'query.include must be an object')

	const pointerFields: QueryFieldName<TSchema>[] = []
	const inclusions = Object.entries(input).map(([fieldName, targetInput]) => {
		assertPlainObject(
			targetInput,
			`query.include.${fieldName} must be an object`,
		)

		const { field, target } = resolveQueryInclusionTarget(schema, fieldName)

		if (field.kind === 'pointer') pointerFields.push(fieldName)

		// Runtime target identity and the relationship field were validated together
		// above; this boundary only restores their compile-time correlation.
		return {
			field: fieldName,
			query: createInputQuery(
				target,
				targetInput,
				field.kind === 'pointer' ? 'pointer-target' : 'relation-target',
			).ast,
		} as unknown as QueryInclusionInput<TSchema>
	})
	const selectedFields = selection.fields.map(({ field }) => field)

	return {
		inclusion: normalizeQueryInclusion(schema, inclusions),
		selection:
			selectedFields.length === 0
				? selection
				: normalizeQuerySelectedFields(schema, [
						...selectedFields,
						...pointerFields,
					]),
	}
}

const createInputQuery = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: unknown,
	kind: QueryInputKind,
): NormalizedQueryInput<TSchema> => {
	const untrustedSchema: unknown = schema

	if (!Schema.is(untrustedSchema)) {
		throw new TypeError(
			'read input schema must be created by App.Schema.define',
		)
	}

	assertQueryInput(input, kind)

	// The initial AST has no schema-specific clauses yet.
	const initial = createQueryAst(schema) as QueryInputAst<TSchema>
	const requestedOrdering =
		input.orderBy === undefined
			? initial.ordering
			: normalizeInputOrdering(schema, input.orderBy)
	// A collection read, root or included, has a total order, so `after`
	// positions are stable (ADR-0309).
	const ordering =
		kind === 'find-many' || kind === 'relation-target'
			? completeQueryOrdering(requestedOrdering)
			: requestedOrdering
	const filter =
		input.where === undefined
			? undefined
			: resolveWhereInput(schema, input.where as WhereInput<TSchema>)
	const expression =
		input.after === undefined
			? filter
			: combineWhereExpressions(
					filter,
					createQueryPositionFilter(
						schema,
						readRequestedQueryPosition(schema, ordering, input.after),
					),
				)
	const where: QueryWhereNode<QueryFilterNode<TSchema>> | undefined =
		expression === undefined
			? undefined
			: immutableRecord({ expression, kind: 'where' })

	if (input.after !== undefined && input.skip !== undefined) {
		throw createInvalidPositionError(
			'cannot be combined with skip',
			'cannot be combined with skip',
		)
	}
	const selection =
		input.select === undefined
			? initial.selection
			: normalizeQuerySelection(schema, input.select as QuerySelection<TSchema>)
	const projection =
		input.include === undefined
			? { inclusion: initial.inclusion, selection }
			: normalizeInputInclusion(schema, input.include, selection)
	const ast: QueryInputAst<TSchema> = immutableRecord({
		...initial,
		...projection,
		where,
		ordering,
		// The pagination normalizers validate these untrusted values themselves.
		take: normalizeQueryTake(input.take as number | undefined),
		pagination:
			input.skip === undefined
				? undefined
				: normalizeQuerySkipPagination({ skip: input.skip as number }),
	})

	return immutableRecord({ ast, schema })
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
> => createInputQuery(schema, input, 'find-many')

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
> => createInputQuery(schema, input, 'find-one')

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
	const query = createInputQuery(schema, input, 'get')
	const untrustedId: unknown = input.id

	if (typeof untrustedId !== 'string') {
		throw new TypeError('get input id must be a string')
	}

	return immutableRecord({ id: input.id, query })
}

/** Normalizes one filtered count input. */
export const queryFromCountInput = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: CountInput<TSchema>,
): NormalizedQueryInput<TSchema> => createInputQuery(schema, input, 'count')

/** Normalizes one filtered existence input. */
export const queryFromExistsInput = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: ExistsInput<TSchema>,
): NormalizedQueryInput<TSchema> => createInputQuery(schema, input, 'exists')
