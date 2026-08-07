import { Schema, type SchemaDefinition } from '../../schema/index.js'
import { getFieldSchemaTarget } from '../../schema/fields/base/definition.js'
import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	QueryAst,
	QueryFieldName,
	QueryInclusionNode,
	QueryWhereNode,
} from '../ast/contracts.js'
import { createQueryAst } from '../ast/factory.js'
import type {
	ExactQuerySelection,
	LiteralQuerySelection,
	QuerySelectedField,
	QuerySelection,
} from '../clauses/selection.js'
import {
	normalizeQuerySelectedFields,
	normalizeQuerySelection,
} from '../clauses/selection.js'
import type {
	QueryIncludableFieldName,
	QueryInclusionAst,
	QueryInclusionInput,
	QueryPointerFieldName,
	QueryPointerTargetSchema,
	QueryRelationFieldName,
	QueryRelationTargetSchema,
} from '../clauses/inclusion.js'
import { normalizeQueryInclusion } from '../clauses/inclusion.js'
import {
	normalizeQueryCursorPagination,
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
	QueryPointerResultInclusion,
	QueryRelationResultInclusion,
} from './result.js'

/** Uses concise transport-facing directions independently from AST vocabulary. */
export type QueryOrderByDirection = 'asc' | 'desc'

type OtherQueryFieldName<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryFieldName<TSchema>,
> = Exclude<QueryFieldName<TSchema>, TFieldName>

/** Describes one ordered field while rejecting ambiguous multi-key objects. */
export type QueryOrderByInput<TSchema extends SchemaDefinition> = {
	[TFieldName in QueryFieldName<TSchema>]: Readonly<
		Record<TFieldName, QueryOrderByDirection> &
			Partial<Record<OtherQueryFieldName<TSchema, TFieldName>, never>>
	>
}[QueryFieldName<TSchema>]

/** Shapes one included pointer target without adding another execution boundary. */
export type QueryPointerTargetInput<TSchema extends SchemaDefinition> =
	Readonly<{
		readonly include?: QueryIncludeInput<TSchema>
		readonly select?: QuerySelection<TSchema>
		readonly where?: WhereInput<TSchema>
	}>

/** Shapes one included to-many target without adding another execution boundary. */
export type QueryRelationTargetInput<TSchema extends SchemaDefinition> =
	Readonly<{
		readonly include?: QueryIncludeInput<TSchema>
		readonly limit?: number
		/** Applies the same offset independently to every ordered parent collection. */
		readonly offset?: number
		readonly orderBy?: readonly QueryOrderByInput<TSchema>[]
		readonly select?: QuerySelection<TSchema>
		readonly where?: WhereInput<TSchema>
	}>

/** Correlates every optional eager inclusion with its exact target schema. */
export type QueryIncludeInput<TSchema extends SchemaDefinition> = Readonly<{
	readonly [
		TFieldName in QueryIncludableFieldName<TSchema>
	]?: TFieldName extends QueryPointerFieldName<TSchema>
		? QueryPointerTargetInput<QueryPointerTargetSchema<TSchema, TFieldName>>
		: TFieldName extends QueryRelationFieldName<TSchema>
			? QueryRelationTargetInput<
					QueryRelationTargetSchema<TSchema, TFieldName>
				>
			: never
}>

interface QueryProjectionInput<TSchema extends SchemaDefinition> {
	/** Loads explicitly requested relationship targets through independently shaped reads. */
	readonly include?: QueryIncludeInput<TSchema>
	/** Projects result fields through literal inclusion or exclusion flags. */
	readonly select?: QuerySelection<TSchema>
}

declare const queryBuilderInputType: unique symbol

interface QueryBuilderInputIdentity<TSelectedField, TIncludedField> {
	readonly [queryBuilderInputType]?: Readonly<{
		readonly includedField: TIncludedField
		readonly selectedField: TSelectedField
	}>
}

interface QueryFilteredInput<TSchema extends SchemaDefinition> {
	/** Restricts the visible row universe through the canonical object filter. */
	readonly where?: WhereInput<TSchema>
}

interface FindManyBaseInput<TSchema extends SchemaDefinition>
	extends QueryFilteredInput<TSchema>, QueryProjectionInput<TSchema> {
	/** Limits the number of returned models. */
	readonly limit?: number
	/** Applies deterministic priority ordering from left to right. */
	readonly orderBy?: readonly QueryOrderByInput<TSchema>[]
}

type QueryPaginationInput =
	| Readonly<{
			/** Starts cursor pagination or resumes it from one opaque cursor. */
			readonly cursor: true | string
			readonly offset?: never
	  }>
	| Readonly<{
			readonly cursor?: never
			/** Applies offset pagination. */
			readonly offset?: number
	  }>

/** Describes one complete collection read without retaining execution state. */
export type FindManyInput<TSchema extends SchemaDefinition> =
	FindManyBaseInput<TSchema> & QueryPaginationInput

/** Describes one first-match read with optional deterministic ordering. */
export interface FindOneInput<TSchema extends SchemaDefinition>
	extends QueryFilteredInput<TSchema>, QueryProjectionInput<TSchema> {
	/** Applies deterministic priority ordering from left to right. */
	readonly orderBy?: readonly QueryOrderByInput<TSchema>[]
}

/** Describes one exact identifier read and its result projection. */
export interface GetInput<
	TSchema extends SchemaDefinition,
> extends QueryProjectionInput<TSchema> {
	/** Selects the framework-owned object identity. */
	readonly id: OperationObjectId<TSchema>
}

/** Describes one filtered count without irrelevant projection clauses. */
export type CountInput<TSchema extends SchemaDefinition> =
	QueryFilteredInput<TSchema>

/** Describes one filtered existence check without loading model values. */
export type ExistsInput<TSchema extends SchemaDefinition> =
	QueryFilteredInput<TSchema>

type ExactSelectionForInput<
	TSchema extends SchemaDefinition,
	TInput,
> = TInput extends { readonly select: infer TSelection }
	? Readonly<{
			readonly select: TSelection &
				QuerySelection<TSchema> &
				ExactQuerySelection<TSchema, TSelection> &
				LiteralQuerySelection<TSelection>
		}>
	: unknown

type ExactInclusionTargetInput<
	TSchema extends SchemaDefinition,
	TInput,
	TContract,
> = TInput extends TContract
		? TInput &
				Readonly<
					Record<
						Exclude<keyof TInput, keyof TContract>,
						never
					>
				> &
				ExactSelectionForInput<TSchema, TInput> &
				ExactIncludeForInput<TSchema, TInput>
		: never

type ExactIncludeValue<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryIncludableFieldName<TSchema>,
	TInclude,
> = TFieldName extends keyof TInclude
	? TFieldName extends QueryPointerFieldName<TSchema>
		? ExactInclusionTargetInput<
				QueryPointerTargetSchema<TSchema, TFieldName>,
				TInclude[TFieldName],
				QueryPointerTargetInput<
					QueryPointerTargetSchema<TSchema, TFieldName>
				>
			>
		: TFieldName extends QueryRelationFieldName<TSchema>
			? ExactInclusionTargetInput<
					QueryRelationTargetSchema<TSchema, TFieldName>,
					TInclude[TFieldName],
					QueryRelationTargetInput<
						QueryRelationTargetSchema<TSchema, TFieldName>
					>
				>
			: never
	: never

type ExactQueryInclude<TSchema extends SchemaDefinition, TInclude> = TInclude &
	Readonly<
		Record<Exclude<keyof TInclude, QueryIncludableFieldName<TSchema>>, never>
	> &
	Readonly<{
		readonly [
			TFieldName in Extract<keyof TInclude, QueryIncludableFieldName<TSchema>>
		]: ExactIncludeValue<TSchema, TFieldName, TInclude>
	}>

type ExactIncludeForInput<
	TSchema extends SchemaDefinition,
	TInput,
> = TInput extends { readonly include: infer TInclude }
	? Readonly<{
			readonly include: ExactQueryInclude<TSchema, TInclude>
		}>
	: unknown

/** Rejects unknown clauses and imprecise nested projections on one read input. */
export type ExactReadInput<
	TSchema extends SchemaDefinition,
	TInput,
	TContract,
> = TInput &
	Readonly<
		Record<
			Exclude<
				keyof TInput,
				| (TContract extends unknown ? keyof TContract : never)
				| typeof queryBuilderInputType
			>,
			never
		>
	> &
	ExactSelectionForInput<TSchema, TInput> &
	ExactIncludeForInput<TSchema, TInput>

type SelectedFieldFromInput<
	TSchema extends SchemaDefinition,
	TInput,
> = TInput extends { readonly select: infer TSelection }
	? QuerySelectedField<TSchema, TSelection>
	: never

type IncludedFieldFromInput<
	TSchema extends SchemaDefinition,
	TInput,
> = TInput extends { readonly include: infer TInclude }
	? Extract<keyof TInclude, QueryPointerFieldName<TSchema>>
	: never

/** Resolves the exact visible field union produced by one canonical read input. */
export type QuerySelectedFieldFromInput<
	TSchema extends SchemaDefinition,
	TInput,
> =
	TInput extends QueryBuilderInputIdentity<infer TSelectedField, unknown>
		? Extract<TSelectedField, QueryFieldName<TSchema>>
		: [SelectedFieldFromInput<TSchema, TInput>] extends [never]
			? never
			: | SelectedFieldFromInput<TSchema, TInput>
				| IncludedFieldFromInput<TSchema, TInput>

type PointerInclusionForField<
	TSchema extends SchemaDefinition,
	TInclude,
	TFieldName extends QueryPointerFieldName<TSchema>,
> = TFieldName extends keyof TInclude
	? TInclude[TFieldName] extends infer TTargetInput
		? QueryPointerResultInclusion<
				TFieldName,
				QueryPointerTargetSchema<TSchema, TFieldName>,
				QuerySelectedFieldFromInput<
					QueryPointerTargetSchema<TSchema, TFieldName>,
					TTargetInput
				>,
				QueryIncludedFieldFromInput<
					QueryPointerTargetSchema<TSchema, TFieldName>,
					TTargetInput
				>
			>
		: never
	: never

type RelationInclusionForField<
	TSchema extends SchemaDefinition,
	TInclude,
	TFieldName extends QueryRelationFieldName<TSchema>,
> = TFieldName extends keyof TInclude
	? TInclude[TFieldName] extends infer TTargetInput
		? QueryRelationResultInclusion<
				TFieldName,
				QueryRelationTargetSchema<TSchema, TFieldName>,
				QuerySelectedFieldFromInput<
					QueryRelationTargetSchema<TSchema, TFieldName>,
					TTargetInput
				>,
				QueryIncludedFieldFromInput<
					QueryRelationTargetSchema<TSchema, TFieldName>,
					TTargetInput
				>
			>
		: never
	: never

/** Resolves every exact nested eager result produced by one read input. */
export type QueryIncludedFieldFromInput<
	TSchema extends SchemaDefinition,
	TInput,
> =
	TInput extends QueryBuilderInputIdentity<unknown, infer TIncludedField>
		? TIncludedField
		: TInput extends { readonly include: infer TInclude }
			? | {
					[
						TFieldName in Extract<
							keyof TInclude,
							QueryPointerFieldName<TSchema>
						>
					]: PointerInclusionForField<TSchema, TInclude, TFieldName>
				}[Extract<keyof TInclude, QueryPointerFieldName<TSchema>>]
				| {
					[
						TFieldName in Extract<
							keyof TInclude,
							QueryRelationFieldName<TSchema>
						>
					]: RelationInclusionForField<TSchema, TInclude, TFieldName>
				}[Extract<keyof TInclude, QueryRelationFieldName<TSchema>>]
			: never

/** @deprecated Use `QueryIncludedFieldFromInput`. */
export type QueryIncludedPointerFromInput<
	TSchema extends SchemaDefinition,
	TInput,
> = QueryIncludedFieldFromInput<TSchema, TInput>

/** Retains exact builder result inference without adding runtime metadata. */
export type QueryBuilderInput<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedField,
> = FindManyInput<TSchema> &
	QueryBuilderInputIdentity<TSelectedField, TIncludedField>

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
			'cursor',
			'include',
			'limit',
			'orderBy',
			'select',
			'offset',
			'where',
		]),
		'find-one': new Set(['include', 'orderBy', 'select', 'where']),
		get: new Set(['id', 'include', 'select']),
		'pointer-target': new Set(['include', 'select', 'where']),
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
	if (!isUnknownArray(input)) {
		throw new TypeError('query.orderBy must be an array')
	}

	const orders: QueryOrderInput<QueryFieldName<TSchema>>[] = []

	for (const [index, item] of input.entries()) {
		if (!isPlainRecord(item)) {
			throw new TypeError(`query.orderBy[${String(index)}] must be an object`)
		}

		const entries = Object.entries(item)

		if (entries.length !== 1) {
			throw new TypeError(
				`query.orderBy[${String(index)}] must contain exactly one field`,
			)
		}

		const entry = entries[0]

		if (entry === undefined) {
			throw new TypeError(
				`query.orderBy[${String(index)}] must contain exactly one field`,
			)
		}

		const [fieldName, direction] = entry

		if (direction !== 'asc' && direction !== 'desc') {
			throw new TypeError(
				`query.orderBy[${String(index)}].${fieldName} must be asc or desc`,
			)
		}

		orders.push({
			direction:
				direction === 'asc'
					? ('ascending' as const)
					: ('descending' as const),
			field: fieldName as QueryFieldName<TSchema>,
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

		const field = schema.fields[fieldName]

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
		inclusions.push(
			{ field: includedField, query: targetQuery.ast } as unknown as QueryInclusionInput<TSchema>,
		)
	}

	const selectionFields = selection.fields.map(({ field }) => field)
	const includedSelection =
		selectionFields.length === 0
			? selection
			: normalizeQuerySelectedFields(schema, [
					...selectionFields,
					...inclusions
						.filter(({ field }) => schema.fields[field]?.kind === 'pointer')
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
	if (input.offset !== undefined && input.cursor !== undefined) {
		throw new TypeError('query cannot combine offset and cursor pagination')
	}

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

	if (input.cursor !== undefined) {
		if (input.cursor !== true && typeof input.cursor !== 'string') {
			throw new TypeError('query.cursor must be true or an opaque string')
		}

		ast = immutableRecord({
			...ast,
			pagination: normalizeQueryCursorPagination(
				input.cursor === true ? {} : { after: input.cursor },
			),
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
