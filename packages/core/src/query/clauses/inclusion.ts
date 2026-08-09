import type { SchemaDefinition } from '../../schema/index.js'
import type { GeneratedSchemaRelationshipTargetName } from '../../schema/generated-contracts.js'
import { getFieldSchemaTarget } from '../../schema/fields/base/definition.js'
import type { PointerField } from '../../schema/fields/builtins/pointer.js'
import type { RelationField } from '../../schema/fields/builtins/relation.js'
import {
	Schema,
	type GeneratedSchemaReference,
} from '../../schema/schema/definition.js'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type {
	QueryAst,
	QueryIncludedPointerNode,
	QueryIncludedRelationNode,
	QueryInclusionNode,
} from '../ast/contracts.js'
import { parseQueryFieldName } from '../ast/schema.js'

/** Selects only scalar pointer keys while retaining each exact target schema. */
export type QueryPointerFieldName<TSchema extends SchemaDefinition> = {
	[
		TFieldName in Extract<keyof TSchema['fields'], string>
	]: TSchema['fields'][TFieldName] extends {
		readonly kind: 'pointer'
	}
		? TFieldName
		: never
}[Extract<keyof TSchema['fields'], string>]

/** Selects only declared to-many relation fields while retaining exact keys. */
export type QueryRelationFieldName<TSchema extends SchemaDefinition> = {
	[
		TFieldName in Extract<keyof TSchema['fields'], string>
	]: TSchema['fields'][TFieldName] extends {
		readonly kind: 'relation'
	}
		? TFieldName
		: never
}[Extract<keyof TSchema['fields'], string>]

/** Selects every field that can own one eager-loading branch. */
export type QueryIncludableFieldName<TSchema extends SchemaDefinition> =
	QueryPointerFieldName<TSchema> | QueryRelationFieldName<TSchema>

type GeneratedRelationshipTargetOr<
	TSchema extends SchemaDefinition,
	TFieldName extends string,
	TFallback extends SchemaDefinition,
> = [GeneratedSchemaRelationshipTargetName<TSchema, TFieldName>] extends [never]
	? TFallback
	: GeneratedSchemaReference<
			GeneratedSchemaRelationshipTargetName<TSchema, TFieldName>
		>

/** Resolves the target schema encoded by one exact pointer field value. */
export type QueryPointerTargetSchema<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryPointerFieldName<TSchema>,
> = GeneratedRelationshipTargetOr<
	TSchema,
	TFieldName,
	TSchema['fields'][TFieldName] extends PointerField<infer TTarget>
		? TTarget
		: never
>

/** Resolves the target schema encoded by one exact relation field value. */
export type QueryRelationTargetSchema<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryRelationFieldName<TSchema>,
> = GeneratedRelationshipTargetOr<
	TSchema,
	TFieldName,
	TSchema['fields'][TFieldName] extends RelationField<infer TTarget>
		? TTarget
		: never
>

/** Resolves the target schema encoded by any includable relationship field. */
export type QueryInclusionTargetSchema<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryIncludableFieldName<TSchema>,
> =
	TFieldName extends QueryPointerFieldName<TSchema>
		? QueryPointerTargetSchema<TSchema, TFieldName>
		: TFieldName extends QueryRelationFieldName<TSchema>
			? QueryRelationTargetSchema<TSchema, TFieldName>
			: never

/** Describes one caller-owned inclusion before immutable normalization. */
export interface QueryPointerInclusionInput<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryPointerFieldName<TSchema> =
		QueryPointerFieldName<TSchema>,
> {
	readonly field: TFieldName
	readonly query: QueryAst<QueryPointerTargetSchema<TSchema, TFieldName>>
}

/** Describes one caller-owned relation branch before immutable normalization. */
export type QueryRelationInclusionInput<TSchema extends SchemaDefinition> = {
	[TFieldName in QueryRelationFieldName<TSchema>]: {
		readonly field: TFieldName
		readonly query: QueryAst<QueryRelationTargetSchema<TSchema, TFieldName>>
	}
}[QueryRelationFieldName<TSchema>]

/** Describes every caller-owned eager branch before immutable normalization. */
export type QueryInclusionInput<TSchema extends SchemaDefinition> =
	QueryPointerInclusionInput<TSchema> | QueryRelationInclusionInput<TSchema>

/** Correlates every pointer key with the exact AST of its declared target. */
export type QueryPointerInclusionNode<TSchema extends SchemaDefinition> = {
	[TFieldName in QueryPointerFieldName<TSchema>]: QueryIncludedPointerNode<
		TFieldName,
		QueryAst<QueryPointerTargetSchema<TSchema, TFieldName>>
	>
}[QueryPointerFieldName<TSchema>]

/** Retains the field-correlated union throughout one source QueryBuilder AST. */
export type QueryPointerInclusionAst<TSchema extends SchemaDefinition> =
	QueryInclusionNode<
		QueryPointerFieldName<TSchema>,
		QueryPointerInclusionNode<TSchema>
	>

/** Correlates every relation key with the exact AST of its declared target. */
export type QueryRelationInclusionNode<TSchema extends SchemaDefinition> = {
	[TFieldName in QueryRelationFieldName<TSchema>]: QueryIncludedRelationNode<
		TFieldName,
		QueryAst<QueryRelationTargetSchema<TSchema, TFieldName>>
	>
}[QueryRelationFieldName<TSchema>]

/** Correlates every includable field with its exact target AST and cardinality. */
export type QueryFieldInclusionNode<TSchema extends SchemaDefinition> =
	QueryPointerInclusionNode<TSchema> | QueryRelationInclusionNode<TSchema>

/** Retains the field-correlated union throughout one source Query AST. */
export type QueryInclusionAst<TSchema extends SchemaDefinition> =
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

const resolveInclusionTarget = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	fieldName: QueryIncludableFieldName<TSchema>,
): SchemaDefinition => {
	const normalizedFieldName = parseQueryFieldName(
		schema,
		fieldName,
		'query inclusion field',
	)
	const field = schema.fields[normalizedFieldName]

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

	return target
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

	const nodes: QueryFieldInclusionNode<TSchema>[] = []

	for (const input of inputs) {
		const target = resolveInclusionTarget(schema, input.field)

		if (input.query.schema.definition !== target) {
			throw new TypeError(
				`query inclusion ${input.field} must use target schema ${target.className}`,
			)
		}

		const field = schema.fields[input.field]
		const node = immutableRecord({
			kind:
				field.kind === 'pointer'
					? ('included-pointer' as const)
					: ('included-relation' as const),
			field: input.field,
			query: input.query,
		}) as unknown as QueryFieldInclusionNode<TSchema>
		const existingIndex = nodes.findIndex(
			(candidate) => candidate.field === input.field,
		)

		if (existingIndex === -1) {
			nodes.push(node)
		} else {
			nodes[existingIndex] = node
		}
	}

	return immutableRecord({
		fields: immutableArray(nodes),
		kind: 'inclusion',
	})
}
