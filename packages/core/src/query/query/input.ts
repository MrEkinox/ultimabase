import { Schema, type SchemaDefinition } from '../../schema/index.js'
import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { QueryFieldName } from '../ast/contracts.js'
import type {
	ExactQuerySelection,
	LiteralQuerySelection,
	QuerySelectedField,
	QuerySelection,
} from '../clauses/selection.js'
import type {
	QueryPointerFieldName,
	QueryPointerTargetSchema,
} from '../clauses/inclusion.js'
import type { WhereInput } from '../filters/where.js'
import type { OperationObjectId } from '../operations/contracts.js'
import type { QueryPointerResultInclusion } from './result.js'
import { QueryBuilder } from './query.js'

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

/** Correlates every optional pointer inclusion with its exact target schema. */
export type QueryIncludeInput<TSchema extends SchemaDefinition> = Readonly<{
	readonly [
		TFieldName in QueryPointerFieldName<TSchema>
	]?: QueryPointerTargetInput<QueryPointerTargetSchema<TSchema, TFieldName>>
}>

interface QueryProjectionInput<TSchema extends SchemaDefinition> {
	/** Loads explicitly requested pointer targets through independently shaped reads. */
	readonly include?: QueryIncludeInput<TSchema>
	/** Projects result fields through literal inclusion or exclusion flags. */
	readonly select?: QuerySelection<TSchema>
}

declare const queryBuilderInputType: unique symbol

interface QueryBuilderInputIdentity<TSelectedField, TIncludedPointer> {
	readonly [queryBuilderInputType]?: Readonly<{
		readonly includedPointer: TIncludedPointer
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
			readonly skip?: never
	  }>
	| Readonly<{
			readonly cursor?: never
			/** Applies offset pagination. */
			readonly skip?: number
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

type ExactPointerTargetInput<TSchema extends SchemaDefinition, TInput> =
	TInput extends QueryPointerTargetInput<TSchema>
		? TInput &
				Readonly<
					Record<
						Exclude<keyof TInput, keyof QueryPointerTargetInput<TSchema>>,
						never
					>
				> &
				ExactSelectionForInput<TSchema, TInput> &
				ExactIncludeForInput<TSchema, TInput>
		: never

type ExactIncludeValue<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryPointerFieldName<TSchema>,
	TInclude,
> = TFieldName extends keyof TInclude
	? ExactPointerTargetInput<
			QueryPointerTargetSchema<TSchema, TFieldName>,
			TInclude[TFieldName]
		>
	: never

type ExactQueryInclude<TSchema extends SchemaDefinition, TInclude> = TInclude &
	Readonly<
		Record<Exclude<keyof TInclude, QueryPointerFieldName<TSchema>>, never>
	> &
	Readonly<{
		readonly [
			TFieldName in Extract<keyof TInclude, QueryPointerFieldName<TSchema>>
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
				QueryIncludedPointerFromInput<
					QueryPointerTargetSchema<TSchema, TFieldName>,
					TTargetInput
				>
			>
		: never
	: never

/** Resolves every exact nested pointer result produced by one read input. */
export type QueryIncludedPointerFromInput<
	TSchema extends SchemaDefinition,
	TInput,
> =
	TInput extends QueryBuilderInputIdentity<unknown, infer TIncludedPointer>
		? TIncludedPointer
		: TInput extends { readonly include: infer TInclude }
			? {
					[
						TFieldName in Extract<
							keyof TInclude,
							QueryPointerFieldName<TSchema>
						>
					]: PointerInclusionForField<TSchema, TInclude, TFieldName>
				}[Extract<keyof TInclude, QueryPointerFieldName<TSchema>>]
			: never

/** Retains exact builder result inference without adding runtime metadata. */
export type QueryBuilderInput<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TIncludedPointer,
> = FindManyInput<TSchema> &
	QueryBuilderInputIdentity<TSelectedField, TIncludedPointer>

type QueryInputKind =
	'count' | 'exists' | 'find-many' | 'find-one' | 'get' | 'pointer-target'

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
			'skip',
			'where',
		]),
		'find-one': new Set(['include', 'orderBy', 'select', 'where']),
		get: new Set(['id', 'include', 'select']),
		'pointer-target': new Set(['include', 'select', 'where']),
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
	query: QueryBuilder<TSchema>,
	input: unknown,
): QueryBuilder<TSchema> => {
	if (!isUnknownArray(input)) {
		throw new TypeError('query.orderBy must be an array')
	}

	let ordered = query

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

		ordered =
			direction === 'asc'
				? ordered.ascending(fieldName as QueryFieldName<TSchema>)
				: ordered.descending(fieldName as QueryFieldName<TSchema>)
	}

	return ordered
}

const applyQueryProjection = <const TSchema extends SchemaDefinition>(
	query: QueryBuilder<TSchema>,
	input: Readonly<Record<string, unknown>>,
): QueryBuilder<TSchema> => {
	let projected = query

	if (input.select !== undefined) {
		// The public generic boundary already proves literal and exact selection
		// keys; QueryBuilder repeats runtime validation for untyped callers.
		projected = projected.select(
			input.select as never,
		) as unknown as QueryBuilder<TSchema>
	}

	if (input.include === undefined) {
		return projected
	}

	if (!isPlainRecord(input.include)) {
		throw new TypeError('query.include must be an object')
	}

	for (const [fieldName, targetInput] of Object.entries(input.include)) {
		if (!isPlainRecord(targetInput)) {
			throw new TypeError(`query.include.${fieldName} must be an object`)
		}

		projected = projected.include(
			fieldName as QueryPointerFieldName<TSchema>,
			(targetQuery) => applyPointerTargetInput(targetQuery, targetInput),
		) as unknown as QueryBuilder<TSchema>
	}

	return projected
}

const applyPointerTargetInput = <const TSchema extends SchemaDefinition>(
	query: QueryBuilder<TSchema>,
	input: Readonly<Record<string, unknown>>,
): QueryBuilder<TSchema> => {
	assertQueryInput(input, 'pointer-target')
	let target = query

	if (input.where !== undefined) {
		target = target.where(input.where as WhereInput<TSchema>)
	}

	return applyQueryProjection(target, input)
}

const createInputQuery = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: Readonly<Record<string, unknown>>,
	kind: QueryInputKind,
): QueryBuilder<TSchema> => {
	const untrustedSchema: unknown = schema

	if (!Schema.is(untrustedSchema)) {
		throw new TypeError('read input schema must be created by Schema.define')
	}

	assertQueryInput(input, kind)
	if (input.skip !== undefined && input.cursor !== undefined) {
		throw new TypeError('query cannot combine skip and cursor pagination')
	}

	let query = new QueryBuilder<TSchema>(schema)

	if (input.where !== undefined) {
		query = query.where(input.where as WhereInput<TSchema>)
	}

	query = applyQueryProjection(query, input)

	if (input.orderBy !== undefined) {
		query = applyQueryOrdering(query, input.orderBy)
	}

	if (input.limit !== undefined) {
		query = query.limit(input.limit as number)
	}

	if (input.skip !== undefined) {
		query = query.skip(input.skip as number)
	}

	if (input.cursor !== undefined) {
		if (input.cursor !== true && typeof input.cursor !== 'string') {
			throw new TypeError('query.cursor must be true or an opaque string')
		}

		query = input.cursor === true ? query.after() : query.after(input.cursor)
	}

	return query
}

/** Normalizes one collection input through the existing immutable QueryBuilder AST. */
export const queryFromFindManyInput = <
	const TSchema extends SchemaDefinition,
	const TInput extends FindManyInput<TSchema>,
>(
	schema: TSchema,
	input: TInput,
): QueryBuilder<
	TSchema,
	QuerySelectedFieldFromInput<TSchema, TInput>,
	QueryIncludedPointerFromInput<TSchema, TInput>
> =>
	createInputQuery(
		schema,
		input as unknown as Readonly<Record<string, unknown>>,
		'find-many',
	) as unknown as QueryBuilder<
		TSchema,
		QuerySelectedFieldFromInput<TSchema, TInput>,
		QueryIncludedPointerFromInput<TSchema, TInput>
	>

/** Normalizes one first-match input through the existing immutable QueryBuilder AST. */
export const queryFromFindOneInput = <
	const TSchema extends SchemaDefinition,
	const TInput extends FindOneInput<TSchema>,
>(
	schema: TSchema,
	input: TInput,
): QueryBuilder<
	TSchema,
	QuerySelectedFieldFromInput<TSchema, TInput>,
	QueryIncludedPointerFromInput<TSchema, TInput>
> =>
	createInputQuery(
		schema,
		input as unknown as Readonly<Record<string, unknown>>,
		'find-one',
	) as unknown as QueryBuilder<
		TSchema,
		QuerySelectedFieldFromInput<TSchema, TInput>,
		QueryIncludedPointerFromInput<TSchema, TInput>
	>

/** Normalizes one identifier input and returns its separately retained ID. */
export const queryFromGetInput = <
	const TSchema extends SchemaDefinition,
	const TInput extends GetInput<TSchema>,
>(
	schema: TSchema,
	input: TInput,
): Readonly<{
	readonly id: OperationObjectId<TSchema>
	readonly query: QueryBuilder<
		TSchema,
		QuerySelectedFieldFromInput<TSchema, TInput>,
		QueryIncludedPointerFromInput<TSchema, TInput>
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
		query: query as unknown as QueryBuilder<
			TSchema,
			QuerySelectedFieldFromInput<TSchema, TInput>,
			QueryIncludedPointerFromInput<TSchema, TInput>
		>,
	})
}

/** Normalizes one filtered count input. */
export const queryFromCountInput = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: CountInput<TSchema>,
): QueryBuilder<TSchema> =>
	createInputQuery(
		schema,
		input as unknown as Readonly<Record<string, unknown>>,
		'count',
	)

/** Normalizes one filtered existence input. */
export const queryFromExistsInput = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: ExistsInput<TSchema>,
): QueryBuilder<TSchema> =>
	createInputQuery(
		schema,
		input as unknown as Readonly<Record<string, unknown>>,
		'exists',
	)
