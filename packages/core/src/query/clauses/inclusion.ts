import type { GenericField, SchemaDefinition } from '../../schema/index.js'
import type {
	SchemaRelationshipFieldName,
	SchemaRelationshipSource,
	SchemaRelationshipTargetName,
	SchemaTypeInfoSource,
} from '../../schema/type-info.js'
import { getFieldSchemaTarget } from '../../schema/fields/base/definition.js'
import { Schema, type SchemaReference } from '../../schema/schema/definition.js'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type {
	QueryAst,
	QueryIncludedPointerNode,
	QueryIncludedRelationNode,
	QueryInclusionNode,
} from '../ast/contracts.js'

export type QueryPointerFieldName<TSchema extends SchemaTypeInfoSource> =
	SchemaRelationshipFieldName<TSchema, 'pointer'>

export type QueryRelationFieldName<TSchema extends SchemaTypeInfoSource> =
	SchemaRelationshipFieldName<TSchema, 'relation'>

/** Selects every field that can own one eager-loading branch. */
export type QueryIncludableFieldName<TSchema extends SchemaTypeInfoSource> =
	QueryPointerFieldName<TSchema> | QueryRelationFieldName<TSchema>

type RelationshipTarget<
	TSchema extends SchemaTypeInfoSource,
	TFieldName extends string,
> = [SchemaRelationshipSource<TSchema, TFieldName>] extends [never]
	? string extends SchemaRelationshipTargetName<TSchema, TFieldName>
		? SchemaDefinition
		: SchemaReference<SchemaRelationshipTargetName<TSchema, TFieldName>>
	: Extract<SchemaRelationshipSource<TSchema, TFieldName>, SchemaDefinition>

/** Resolves the target schema encoded by one exact pointer field value. */
export type QueryPointerTargetSchema<
	TSchema extends SchemaTypeInfoSource,
	TFieldName extends QueryPointerFieldName<TSchema>,
> = RelationshipTarget<TSchema, TFieldName>

/** Resolves the target schema encoded by one exact relation field value. */
export type QueryRelationTargetSchema<
	TSchema extends SchemaTypeInfoSource,
	TFieldName extends QueryRelationFieldName<TSchema>,
> = RelationshipTarget<TSchema, TFieldName>

/** Resolves the target schema encoded by any includable relationship field. */
export type QueryInclusionTargetSchema<
	TSchema extends SchemaTypeInfoSource,
	TFieldName extends QueryIncludableFieldName<TSchema>,
> =
	TFieldName extends QueryPointerFieldName<TSchema>
		? QueryPointerTargetSchema<TSchema, TFieldName>
		: TFieldName extends QueryRelationFieldName<TSchema>
			? QueryRelationTargetSchema<TSchema, TFieldName>
			: never

/** Describes one caller-owned inclusion before immutable normalization. */
export interface QueryPointerInclusionInput<
	TSchema extends SchemaTypeInfoSource,
	TFieldName extends QueryPointerFieldName<TSchema> =
		QueryPointerFieldName<TSchema>,
> {
	readonly field: TFieldName
	readonly query: QueryAst<QueryPointerTargetSchema<TSchema, TFieldName>>
}

/** Describes one caller-owned relation branch before immutable normalization. */
export type QueryRelationInclusionInput<TSchema extends SchemaTypeInfoSource> =
	{
		[TFieldName in QueryRelationFieldName<TSchema>]: {
			readonly field: TFieldName
			readonly query: QueryAst<QueryRelationTargetSchema<TSchema, TFieldName>>
		}
	}[QueryRelationFieldName<TSchema>]

/** Describes every caller-owned eager branch before immutable normalization. */
export type QueryInclusionInput<TSchema extends SchemaTypeInfoSource> =
	QueryPointerInclusionInput<TSchema> | QueryRelationInclusionInput<TSchema>

/** Correlates every pointer key with the exact AST of its declared target. */
export type QueryPointerInclusionNode<TSchema extends SchemaTypeInfoSource> = {
	[TFieldName in QueryPointerFieldName<TSchema>]: QueryIncludedPointerNode<
		TFieldName,
		QueryAst<QueryPointerTargetSchema<TSchema, TFieldName>>
	>
}[QueryPointerFieldName<TSchema>]

/** Retains the field-correlated union throughout one source QueryBuilder AST. */
export type QueryPointerInclusionAst<TSchema extends SchemaTypeInfoSource> =
	QueryInclusionNode<
		QueryPointerFieldName<TSchema>,
		QueryPointerInclusionNode<TSchema>
	>

/** Correlates every relation key with the exact AST of its declared target. */
export type QueryRelationInclusionNode<TSchema extends SchemaTypeInfoSource> = {
	[TFieldName in QueryRelationFieldName<TSchema>]: QueryIncludedRelationNode<
		TFieldName,
		QueryAst<QueryRelationTargetSchema<TSchema, TFieldName>>
	>
}[QueryRelationFieldName<TSchema>]

/** Correlates every includable field with its exact target AST and cardinality. */
export type QueryFieldInclusionNode<TSchema extends SchemaTypeInfoSource> =
	QueryPointerInclusionNode<TSchema> | QueryRelationInclusionNode<TSchema>

/** Retains the field-correlated union throughout one source Query AST. */
export type QueryInclusionAst<TSchema extends SchemaTypeInfoSource> =
	QueryInclusionNode<
		QueryIncludableFieldName<TSchema>,
		QueryFieldInclusionNode<TSchema>
	>

/** Empty inclusion state is safe to share because its complete topology is frozen. */
export const emptyQueryInclusion: QueryInclusionNode<never, never> =
	immutableRecord({
		fields: immutableArray([]),
		kind: 'inclusion',
	})

type QueryInclusionField = GenericField & {
	readonly kind: 'pointer' | 'relation'
}

interface ResolvedQueryInclusionTarget {
	readonly field: QueryInclusionField
	readonly target: SchemaDefinition
}

const isQueryInclusionField = (
	field: GenericField | undefined,
): field is QueryInclusionField =>
	field?.kind === 'pointer' || field?.kind === 'relation'

/** Resolves the one relationship boundary shared by every Query inclusion author. */
export const resolveQueryInclusionTarget = (
	schema: SchemaDefinition,
	fieldName: unknown,
): ResolvedQueryInclusionTarget => {
	const field =
		typeof fieldName === 'string'
			? schema.persistedFields[fieldName]
			: undefined

	if (!isQueryInclusionField(field)) {
		throw new TypeError(
			'query inclusion field must reference a pointer or relation field',
		)
	}

	const target = getFieldSchemaTarget(field)?.()

	if (!Schema.is(target)) {
		throw new TypeError(
			'query inclusion target must be created by App.Schema.define',
		)
	}

	return { field, target }
}

/**
 * Normalizes relationship inclusions while preserving first position and last shape.
 *
 * Repeating one relationship key replaces its target query without reordering it,
 * matching the deterministic replacement rule used by query ordering.
 */
export const normalizeQueryInclusion = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	inputs: readonly QueryInclusionInput<TSchema>[],
): QueryInclusionAst<TSchema> => {
	if (inputs.length === 0) {
		return emptyQueryInclusion
	}

	const nodes = new Map<string, QueryFieldInclusionNode<TSchema>>()

	for (const input of inputs) {
		const { field, target } = resolveQueryInclusionTarget(schema, input.field)

		if (input.query.schema.definition !== target) {
			throw new TypeError(
				`query inclusion ${input.field} must use target schema ${target.className}`,
			)
		}

		const node = immutableRecord({
			kind:
				field.kind === 'pointer'
					? ('included-pointer' as const)
					: ('included-relation' as const),
			field: input.field,
			query: input.query,
		}) as unknown as QueryFieldInclusionNode<TSchema>
		// Updating a Map value retains the relationship's first insertion position.
		nodes.set(input.field, node)
	}

	return immutableRecord({
		fields: immutableArray([...nodes.values()]),
		kind: 'inclusion',
	})
}
