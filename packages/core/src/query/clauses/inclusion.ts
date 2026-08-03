import type { SchemaDefinition } from '../../schema/index.js'
import { getFieldSchemaTarget } from '../../schema/fields/base/definition.js'
import type { PointerField } from '../../schema/fields/builtins/pointer.js'
import { Schema } from '../../schema/schema/definition.js'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type {
	QueryAst,
	QueryIncludedPointerNode,
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

/** Resolves the target schema encoded by one exact pointer field value. */
export type QueryPointerTargetSchema<
	TSchema extends SchemaDefinition,
	TFieldName extends QueryPointerFieldName<TSchema>,
> = TSchema['fields'][TFieldName] extends {
	readonly kind: 'pointer'
}
	? TSchema['fields'][TFieldName] extends PointerField<infer TTarget>
		? TTarget
		: never
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

/** Correlates every pointer key with the exact AST of its declared target. */
export type QueryPointerInclusionNode<TSchema extends SchemaDefinition> = {
	[TFieldName in QueryPointerFieldName<TSchema>]: QueryIncludedPointerNode<
		TFieldName,
		QueryAst<QueryPointerTargetSchema<TSchema, TFieldName>>
	>
}[QueryPointerFieldName<TSchema>]

/** Retains the field-correlated union throughout one source Query AST. */
export type QueryPointerInclusionAst<TSchema extends SchemaDefinition> =
	QueryInclusionNode<
		QueryPointerFieldName<TSchema>,
		QueryPointerInclusionNode<TSchema>
	>

/** Empty inclusion state is safe to share because its complete topology is frozen. */
export const emptyQueryInclusion: QueryInclusionNode<never, never> =
	immutableRecord({
		kind: 'inclusion',
		pointers: immutableArray([]),
	})

const resolvePointerTarget = <
	const TSchema extends SchemaDefinition,
	TFieldName extends QueryPointerFieldName<TSchema>,
>(
	schema: TSchema,
	fieldName: TFieldName,
): QueryPointerTargetSchema<TSchema, TFieldName> => {
	const normalizedFieldName = parseQueryFieldName(
		schema,
		fieldName,
		'query inclusion field',
	)
	const field = schema.fields[normalizedFieldName]

	if (field?.kind !== 'pointer') {
		throw new TypeError('query inclusion field must reference a pointer field')
	}

	const target = getFieldSchemaTarget(field)?.()

	if (!Schema.is(target)) {
		throw new TypeError(
			'query inclusion target must be created by Schema.define',
		)
	}

	// Pointer field inference already correlates this private target with the key.
	return target as unknown as QueryPointerTargetSchema<TSchema, TFieldName>
}

/**
 * Normalizes pointer inclusions while preserving first position and last shape.
 *
 * Repeating one pointer key replaces its target query without reordering it,
 * matching the deterministic replacement rule used by query ordering.
 */
export const normalizeQueryInclusion = <
	const TSchema extends SchemaDefinition,
	TFieldName extends QueryPointerFieldName<TSchema>,
>(
	schema: TSchema,
	inputs: readonly QueryPointerInclusionInput<TSchema, TFieldName>[],
): QueryPointerInclusionAst<TSchema> => {
	if (inputs.length === 0) {
		return emptyQueryInclusion
	}

	const nodes: QueryPointerInclusionNode<TSchema>[] = []

	for (const input of inputs) {
		const target = resolvePointerTarget(schema, input.field)

		if (input.query.schema.definition !== target) {
			throw new TypeError(
				`query inclusion ${input.field} must use target schema ${target.className}`,
			)
		}

		const node = immutableRecord({
			kind: 'included-pointer',
			field: input.field,
			query: input.query,
		}) as QueryPointerInclusionNode<TSchema>
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
		kind: 'inclusion',
		pointers: immutableArray(nodes),
	})
}
