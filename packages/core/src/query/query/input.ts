import { Schema, type SchemaDefinition } from '../../schema/index.js'
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
import {
	normalizeQueryInclusion,
	resolveQueryInclusionTarget,
} from '../clauses/inclusion.js'
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

const normalizeInputOrdering = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: unknown,
): QueryInputAst<TSchema>['ordering'] => {
	if (!isPlainRecord(input)) {
		throw new TypeError('query.orderBy must be an object')
	}

	const orders: QueryOrderInput<QueryFieldName<TSchema>>[] = []

	for (const [fieldName, direction] of Object.entries(input)) {
		if (direction === null) {
			// Null directions are ignored, but still name a real schema field.
			parseQueryFieldName(schema, fieldName, `query.orderBy.${fieldName}`)
		} else if (direction === 'asc' || direction === 'desc') {
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
	if (!isPlainRecord(input)) {
		throw new TypeError('query.include must be an object')
	}

	const pointerFields: QueryFieldName<TSchema>[] = []
	const inclusions = Object.entries(input).map(([fieldName, targetInput]) => {
		if (!isPlainRecord(targetInput)) {
			throw new TypeError(`query.include.${fieldName} must be an object`)
		}

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
	const where: QueryWhereNode<QueryFilterNode<TSchema>> | undefined =
		input.where === undefined
			? undefined
			: immutableRecord({
					expression: resolveWhereInput(
						schema,
						input.where as WhereInput<TSchema>,
					),
					kind: 'where',
				})
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
		ordering:
			input.orderBy === undefined
				? initial.ordering
				: normalizeInputOrdering(schema, input.orderBy),
		// The pagination normalizers validate these untrusted values themselves.
		limit: normalizeQueryLimit(input.limit as number | undefined),
		pagination:
			input.offset === undefined
				? undefined
				: normalizeQueryOffsetPagination({ offset: input.offset as number }),
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
