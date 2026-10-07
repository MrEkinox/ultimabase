import type { SchemaCreateData, SchemaDefinition } from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { assertExactCommandKeys } from '../../exact-object-validation.js'

import type { QueryAst } from '../ast/contracts.js'
import type { QueryFilterNode } from '../filters/logical.js'
import type {
	UpdateExpression,
	UpdateExpressionInput,
} from '../updates/contracts.js'
import { normalizeUpdateExpression } from '../updates/normalize.js'
import type { UniqueUpsertTargetNode } from './contracts.js'

/** Accepts QueryBuilder and compatible immutable query holders without importing QueryBuilder at runtime. */
export interface UpsertTargetQuery<TSchema extends SchemaDefinition> {
	readonly ast: QueryAst<TSchema, QueryFilterNode<TSchema>>
}

/** Keeps create and update behavior explicit when the unique target is absent or present. */
export type UpsertInput<TSchema extends SchemaDefinition> = {
	readonly create: SchemaCreateData<TSchema>
	readonly update: UpdateExpressionInput<TSchema> & {}
} & {}

/** Describes one independently targeted item inside an ordered bulk upsert. */
export type UpsertManyItemInput<TSchema extends SchemaDefinition> =
	UpsertInput<TSchema> & {
		readonly query: UpsertTargetQuery<TSchema>
	}

interface NormalizedUpsertInput<TSchema extends SchemaDefinition> {
	readonly create: SchemaCreateData<TSchema>
	readonly update: UpdateExpression<TSchema>
}

const idTargetFields = immutableArray(['id'] as const)

const hasSameFields = (
	left: readonly string[],
	right: readonly string[],
): boolean =>
	left.length === right.length &&
	left.every((fieldName) => right.includes(fieldName))

/** Reads the top-level conjunction members of one normalized unique target filter. */
const readEqualityExpressions = (filter: unknown): readonly unknown[] => {
	if (!isPlainRecord(filter)) {
		throw new TypeError('upsert target must contain query filters')
	}

	if (filter.kind !== 'and') return immutableArray([filter])

	if (!isUnknownArray(filter.expressions)) {
		throw new TypeError('upsert target conjunction must contain filters')
	}

	return filter.expressions
}

/** Recovers the exact equality values carried by one normalized unique target. */
export const readUniqueUpsertTargetValues = <
	const TSchema extends SchemaDefinition,
>(
	query: QueryAst<TSchema>,
	target: UniqueUpsertTargetNode<TSchema>,
): Readonly<Record<string, unknown>> => {
	if (query.where === undefined) {
		throw new TypeError('upsert target query must contain equality values')
	}

	const expressions = readEqualityExpressions(query.where.expression)
	const values: Record<string, unknown> = {}

	if (expressions.length !== target.fields.length) {
		throw new TypeError('upsert target query contains incompatible equalities')
	}

	for (const fieldName of target.fields) {
		const expression = expressions.find(
			(candidate) =>
				isPlainRecord(candidate) &&
				candidate.kind === 'equal' &&
				candidate.field === fieldName &&
				Object.hasOwn(candidate, 'value'),
		)

		if (!isPlainRecord(expression)) {
			throw new TypeError(
				`upsert target query is missing equality field: ${fieldName}`,
			)
		}
		if (expression.value === null || expression.value === undefined) {
			throw new TypeError(
				`upsert target equality must be non-null: ${fieldName}`,
			)
		}

		values[fieldName] = expression.value
	}

	return immutableRecord(values)
}

/** Normalizes the shared create-or-update values used by singular and bulk upserts. */
export const normalizeUpsertInput = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: UpsertInput<TSchema>,
): NormalizedUpsertInput<TSchema> => {
	const untrustedInput: unknown = input

	assertExactCommandKeys(untrustedInput, 'upsert input', ['create', 'update'])

	return immutableRecord({
		create: input.create,
		update: normalizeUpdateExpression(schema, input.update),
	})
}

/** Resolves one exact unique key and rejects query clauses that cannot identify a row. */
export const normalizeUniqueUpsertTarget = <
	const TSchema extends SchemaDefinition,
>(
	schema: TSchema,
	query: QueryAst<TSchema, QueryFilterNode<TSchema>>,
	path = 'upsert target',
): UniqueUpsertTargetNode<TSchema> => {
	if (query.schema.definition !== schema) {
		const queryPath = path === 'upsert target' ? 'upsert' : path

		throw new TypeError(
			`${queryPath} query must reference the operation schema`,
		)
	}

	if (
		query.ordering.orders.length > 0 ||
		query.limit !== undefined ||
		query.pagination !== undefined
	) {
		throw new TypeError(`${path} query cannot use ordering or pagination`)
	}

	if (query.where === undefined) {
		throw new TypeError(`${path} query must contain a unique equality filter`)
	}

	const expressions = readEqualityExpressions(query.where.expression)
	const targetFields: string[] = []

	for (const expression of expressions) {
		if (
			!isPlainRecord(expression) ||
			expression.kind !== 'equal' ||
			typeof expression.field !== 'string' ||
			expression.value === null ||
			expression.value === undefined ||
			targetFields.includes(expression.field)
		) {
			throw new TypeError(
				`${path} must contain distinct non-null equality filters`,
			)
		}

		targetFields.push(expression.field)
	}

	const fields = hasSameFields(targetFields, idTargetFields)
		? idTargetFields
		: schema.indexes.find(
				(index) => index.unique && hasSameFields(targetFields, index.fields),
			)?.fields

	if (fields === undefined) {
		throw new TypeError(`${path} must match id or one declared unique index`)
	}

	// The matching above proves every retained name belongs to the exact schema key.
	return immutableRecord({ kind: 'unique-upsert-target', fields })
}
