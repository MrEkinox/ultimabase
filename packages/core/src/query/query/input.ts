import { Schema, type SchemaDefinition } from '../../schema/index.js'
import type {
	SchemaTypeInfo,
	SchemaTypeInfoFor,
	SchemaTypeInfoSource,
	SchemaTypeValue,
} from '../../schema/type-info.js'
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

/** Uses the compact generated ordering contract when available. */
export type QueryOrderByInput<TSchema extends SchemaTypeInfoSource> =
	SchemaTypeValue<TSchema, 'OrderBy'>

/** Shapes one included pointer target without adding another execution boundary. */
export type QueryPointerTargetInput<TSchema extends SchemaTypeInfoSource> =
	Readonly<{
		readonly include?: QueryIncludeInput<TSchema>
		readonly select?: QuerySelection<TSchema>
	}>

/** Shapes one included to-many target without adding another execution boundary. */
export type QueryRelationTargetInput<TSchema extends SchemaTypeInfoSource> =
	Readonly<{
		readonly include?: QueryIncludeInput<TSchema>
		readonly limit?: number
		/** Applies the same offset independently to every ordered parent collection. */
		readonly offset?: number
		readonly orderBy?: QueryOrderByInput<TSchema>
		readonly select?: QuerySelection<TSchema>
		readonly where?: WhereInput<TSchema>
	}>

/** Uses the generated relationship input without reconstructing schema fields. */
export type QueryIncludeInput<TSchema extends SchemaTypeInfoSource> =
	SchemaTypeValue<TSchema, 'Include'>

interface QueryProjectionInput<TSchema extends SchemaTypeInfoSource> {
	/** Loads explicitly requested relationship targets through independently shaped reads. */
	readonly include?: QueryIncludeInput<TSchema>
	/** Projects result fields through literal inclusion or exclusion flags. */
	readonly select?: QuerySelection<TSchema>
}

declare const queryBuilderInputType: unique symbol

interface QueryBuilderInputIdentity<TSelectedField, TIncludedField> {
	readonly [queryBuilderInputType]: Readonly<{
		readonly includedField: TIncludedField
		readonly selectedField: TSelectedField
	}>
}

interface QueryFilteredInput<TSchema extends SchemaTypeInfoSource> {
	/** Restricts the visible row universe through the canonical object filter. */
	readonly where?: WhereInput<TSchema>
}

interface FindManyBaseInput<TSchema extends SchemaTypeInfoSource>
	extends QueryFilteredInput<TSchema>, QueryProjectionInput<TSchema> {
	/** Limits the number of returned models. */
	readonly limit?: number
	/** Applies offset pagination. */
	readonly offset?: number
	/** Applies deterministic priority ordering from left to right. */
	readonly orderBy?: QueryOrderByInput<TSchema>
}

/** Describes one complete collection read without retaining execution state. */
export type FindManyInput<TSchema extends SchemaTypeInfoSource> =
	FindManyBaseInput<TSchema>

/** Describes one first-match read with optional deterministic ordering. */
export interface FindOneInput<TSchema extends SchemaTypeInfoSource>
	extends QueryFilteredInput<TSchema>, QueryProjectionInput<TSchema> {
	/** Applies deterministic priority ordering from left to right. */
	readonly orderBy?: QueryOrderByInput<TSchema>
}

/** Describes one exact identifier read and its result projection. */
export interface GetInput<
	TSchema extends SchemaTypeInfoSource,
> extends QueryProjectionInput<TSchema> {
	/** Selects the framework-owned object identity. */
	readonly id: OperationObjectId<TSchema>
}

/** Describes one filtered count without irrelevant projection clauses. */
export type CountInput<TSchema extends SchemaTypeInfoSource> =
	QueryFilteredInput<TSchema>

/** Describes one filtered existence check without loading model values. */
export type ExistsInput<TSchema extends SchemaTypeInfoSource> =
	QueryFilteredInput<TSchema>

type ExactSelectionForInput<
	TSchema extends SchemaTypeInfoSource,
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
	TSchema extends SchemaTypeInfoSource,
	TInput,
	TContract,
> = TInput extends TContract
	? TInput &
			Readonly<Record<Exclude<keyof TInput, keyof TContract>, never>> &
			ExactSelectionForInput<TSchema, TInput> &
			ExactIncludeForInput<TSchema, TInput>
	: never

type ExactIncludeValue<
	TSchema extends SchemaTypeInfoSource,
	TFieldName extends QueryIncludableFieldName<TSchema>,
	TInclude,
> = TFieldName extends keyof TInclude
	? TFieldName extends QueryPointerFieldName<TSchema>
		? ExactInclusionTargetInput<
				QueryPointerTargetSchema<TSchema, TFieldName>,
				TInclude[TFieldName],
				QueryPointerTargetInput<QueryPointerTargetSchema<TSchema, TFieldName>>
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

type ExactQueryInclude<
	TSchema extends SchemaTypeInfoSource,
	TInclude,
> = TInclude &
	Readonly<
		Record<Exclude<keyof TInclude, QueryIncludableFieldName<TSchema>>, never>
	> &
	Readonly<{
		readonly [
			TFieldName in Extract<keyof TInclude, QueryIncludableFieldName<TSchema>>
		]: ExactIncludeValue<TSchema, TFieldName, TInclude>
	}>

type ExactIncludeForInput<
	TSchema extends SchemaTypeInfoSource,
	TInput,
> = TInput extends { readonly include: infer TInclude }
	? Readonly<{
			readonly include: ExactQueryInclude<TSchema, TInclude>
		}>
	: unknown

/**
 * Rejects unknown clauses and imprecise nested projections on one read input.
 * `NoInfer` keeps generated clause aliases visible while `TInput` still retains
 * the literal projection needed to infer the exact result model.
 */
export type ExactReadInput<
	TSchema extends SchemaTypeInfoSource,
	TInput,
	TContract,
> =
	string extends QueryFieldName<TSchema>
		? NoInfer<TContract> & TInput
		: NoInfer<TContract> &
				TInput &
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

type ExactReadSelectionInput<
	TContract extends SchemaTypeInfo,
	TSelection extends TContract['inputs']['select'] | undefined,
> = string extends TContract['fields']
	? Readonly<{
			readonly select?: TSelection & TContract['inputs']['select']
		}>
	: Readonly<{
			readonly select?: TSelection &
				TContract['inputs']['select'] &
				Readonly<
					Record<
						Exclude<keyof TSelection, keyof TContract['inputs']['select']>,
						never
					>
				> &
				LiteralQuerySelection<TSelection>
		}>

type ExactGeneratedValue<TInput, TContract> = TInput extends readonly unknown[]
	? TInput extends TContract
		? TInput
		: never
	: TInput extends object
		? TContract extends object
			? TInput &
					Readonly<Record<Exclude<keyof TInput, keyof TContract>, never>> &
					Readonly<{
						readonly [
							TKey in Extract<keyof TInput, keyof TContract>
						]: ExactGeneratedValue<TInput[TKey], NonNullable<TContract[TKey]>>
					}>
			: never
		: TInput extends TContract
			? TInput
			: never

type ExactReadInclusionInput<
	TContract extends SchemaTypeInfo,
	TInclude,
> = string extends TContract['fields']
	? Readonly<{
			readonly include?: TInclude & NonNullable<TContract['inputs']['include']>
		}>
	: Readonly<{
			readonly include?: NonNullable<TContract['inputs']['include']> &
				TInclude &
				ExactGeneratedValue<
					TInclude,
					NonNullable<TContract['inputs']['include']>
				>
		}>

/** Reuses exact generated nested inclusion validation outside read terminals. */
export type ExactGeneratedInclusionInput<
	TSchema extends SchemaTypeInfoSource,
	TInclude extends SchemaTypeInfoFor<TSchema>['inputs']['include'] | undefined,
> = ExactReadInclusionInput<SchemaTypeInfoFor<TSchema>, TInclude>

interface ExactFindManyFields<TContract extends SchemaTypeInfo> {
	/** Limits the number of returned models. */
	readonly limit?: number
	/** Applies deterministic priority ordering from left to right. */
	readonly orderBy?: TContract['inputs']['orderBy']
	/** Restricts the visible row universe through the generated schema filter. */
	readonly where?: TContract['inputs']['where']
}

type ExactFindManyProjectionInput<
	TContract extends SchemaTypeInfo,
	TSelection extends TContract['inputs']['select'] | undefined,
	TInclude extends TContract['inputs']['include'] | undefined,
> = ExactFindManyFields<TContract> &
	ExactReadSelectionInput<TContract, TSelection> &
	ExactReadInclusionInput<TContract, TInclude>

interface ExactFindOneFields<TContract extends SchemaTypeInfo> {
	/** Applies deterministic priority ordering from left to right. */
	readonly orderBy?: TContract['inputs']['orderBy']
	/** Restricts the visible row universe through the generated schema filter. */
	readonly where?: TContract['inputs']['where']
}

/** Describes one exact first-match read from its generated contract. */
export type ExactGeneratedFindOneInput<
	TContract extends SchemaTypeInfo,
	TSelection extends TContract['inputs']['select'] | undefined = undefined,
	TInclude extends TContract['inputs']['include'] | undefined = undefined,
> = ExactFindOneFields<TContract> &
	ExactReadSelectionInput<TContract, TSelection> &
	ExactReadInclusionInput<TContract, TInclude>

/** Describes one exact identifier read from its generated contract. */
export type ExactGeneratedGetInput<
	TContract extends SchemaTypeInfo,
	TSelection extends TContract['inputs']['select'] | undefined = undefined,
	TInclude extends TContract['inputs']['include'] | undefined = undefined,
> = Readonly<{ readonly id: OperationObjectId<TContract> }> &
	ExactReadSelectionInput<TContract, TSelection> &
	ExactReadInclusionInput<TContract, TInclude>

/** Describes one exact collection read using optional offset pagination. */
export type ExactGeneratedFindManyInput<
	TContract extends SchemaTypeInfo,
	TSelection extends TContract['inputs']['select'] | undefined = undefined,
	TInclude extends TContract['inputs']['include'] | undefined = undefined,
> = ExactFindManyProjectionInput<TContract, TSelection, TInclude> &
	Readonly<{ readonly offset?: number }>

type SelectedFieldFromInput<
	TSchema extends SchemaTypeInfoSource,
	TInput,
> = TInput extends { readonly select: infer TSelection }
	? QuerySelectedField<TSchema, TSelection>
	: never

type IncludedFieldFromInput<
	TSchema extends SchemaTypeInfoSource,
	TInput,
> = TInput extends { readonly include: infer TInclude }
	? Extract<keyof TInclude, QueryPointerFieldName<TSchema>>
	: never

/** Resolves the exact visible field union produced by one canonical read input. */
export type QuerySelectedFieldFromInput<
	TSchema extends SchemaTypeInfoSource,
	TInput,
> =
	TInput extends QueryBuilderInputIdentity<infer TSelectedField, unknown>
		? Extract<TSelectedField, QueryFieldName<TSchema>>
		: [SelectedFieldFromInput<TSchema, TInput>] extends [never]
			? never
			: | SelectedFieldFromInput<TSchema, TInput>
				| IncludedFieldFromInput<TSchema, TInput>

type PointerInclusionForField<
	TSchema extends SchemaTypeInfoSource,
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
	TSchema extends SchemaTypeInfoSource,
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
	TSchema extends SchemaTypeInfoSource,
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

/** Retains exact builder result inference without adding runtime metadata. */
export type QueryBuilderInput<
	TSchema extends SchemaTypeInfoSource,
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
