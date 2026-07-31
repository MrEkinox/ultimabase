import type { InferCreateInput, SchemaDefinition } from '@ultimabase/schema'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { QueryAst } from '../ast/contracts.js'
import type { QueryFilterNode } from '../filters/logical.js'
import type {
	UpdateExpression,
	UpdateExpressionInput,
} from '../updates/contracts.js'
import { normalizeUpdateExpression } from '../updates/normalize.js'
import type {
	UniqueUpsertTargetNode,
	UpsertOperationItem,
} from './contracts.js'

/** Accepts Query and compatible immutable query holders without importing Query at runtime. */
export interface UpsertTargetQuery<TSchema extends SchemaDefinition> {
	readonly ast: QueryAst<TSchema, QueryFilterNode<TSchema>>
}

/** Keeps create and update behavior explicit when the unique target is absent or present. */
export interface UpsertInput<TSchema extends SchemaDefinition> {
	readonly create: InferCreateInput<TSchema>
	readonly update: UpdateExpressionInput<TSchema>
}

/** Describes one independently targeted item inside an ordered bulk upsert. */
export interface UpsertManyItemInput<
	TSchema extends SchemaDefinition,
> extends UpsertInput<TSchema> {
	readonly query: UpsertTargetQuery<TSchema>
}

interface NormalizedUpsertInput<TSchema extends SchemaDefinition> {
	readonly create: InferCreateInput<TSchema>
	readonly update: UpdateExpression<TSchema>
}

const idTargetFields = immutableArray(['id'] as const)

const createUniqueUpsertTarget = <const TSchema extends SchemaDefinition>(
	fields: readonly [string, ...string[]],
): UniqueUpsertTargetNode<TSchema> =>
	// Runtime matching below proves every retained name belongs to the exact schema key.
	immutableRecord({
		kind: 'unique-upsert-target',
		fields,
	}) as UniqueUpsertTargetNode<TSchema>

const hasSameFields = (
	left: readonly string[],
	right: readonly string[],
): boolean =>
	left.length === right.length &&
	left.every((fieldName) => right.includes(fieldName))

const readEqualityExpressions = (filter: unknown): readonly unknown[] => {
	if (!isPlainRecord(filter)) {
		throw new TypeError('upsert target must contain query filters')
	}

	if (filter.kind !== 'and') {
		return immutableArray([filter])
	}

	if (!isUnknownArray(filter.expressions)) {
		throw new TypeError('upsert target conjunction must contain filters')
	}

	return filter.expressions
}

function assertExactUpsertKeys(
	input: unknown,
	allowedKeys: ReadonlySet<string>,
	path: string,
): asserts input is Readonly<Record<string, unknown>> {
	if (!isPlainRecord(input)) {
		throw new TypeError(`${path} must be an object`)
	}

	for (const key of Object.keys(input)) {
		if (!allowedKeys.has(key)) {
			throw new TypeError(`${path} contains unknown key: ${key}`)
		}
	}

	for (const key of allowedKeys) {
		if (!Object.hasOwn(input, key)) {
			throw new TypeError(`${path} must contain key: ${key}`)
		}
	}
}

const upsertInputKeys = new Set(['create', 'update'])
const upsertItemKeys = new Set(['query', ...upsertInputKeys])

/** Normalizes the shared create-or-update values used by singular and bulk upserts. */
export const normalizeUpsertInput = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: UpsertInput<TSchema>,
): NormalizedUpsertInput<TSchema> => {
	assertExactUpsertKeys(input, upsertInputKeys, 'upsert input')

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
): UniqueUpsertTargetNode<TSchema> => {
	if (query.schema.definition !== schema) {
		throw new TypeError('upsert query must reference the operation schema')
	}

	if (
		query.ordering.orders.length > 0 ||
		query.limit !== undefined ||
		query.pagination !== undefined
	) {
		throw new TypeError('upsert target query cannot use ordering or pagination')
	}

	if (query.where === undefined) {
		throw new TypeError(
			'upsert target query must contain a unique equality filter',
		)
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
				'upsert target must contain distinct non-null equality filters',
			)
		}

		targetFields.push(expression.field)
	}

	let fields: readonly [string, ...string[]] | undefined = hasSameFields(
		targetFields,
		idTargetFields,
	)
		? idTargetFields
		: undefined

	for (const index of schema.indexes) {
		if (
			fields === undefined &&
			index.unique &&
			hasSameFields(targetFields, index.fields)
		) {
			fields = index.fields
		}
	}

	if (fields === undefined) {
		throw new TypeError(
			'upsert target must match id or one declared unique index',
		)
	}

	return createUniqueUpsertTarget<TSchema>(fields)
}

/** Normalizes one public bulk item without retaining its mutable wrapper object. */
export const normalizeUpsertItem = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	input: UpsertManyItemInput<TSchema>,
): UpsertOperationItem<TSchema, UpdateExpression<TSchema>> => {
	const untrustedInput: unknown = input
	assertExactUpsertKeys(untrustedInput, upsertItemKeys, 'upsert item')

	if (
		typeof untrustedInput.query !== 'object' ||
		untrustedInput.query === null ||
		!('ast' in untrustedInput.query)
	) {
		throw new TypeError('upsert item query must expose an AST')
	}

	const query: unknown = untrustedInput.query.ast

	if (!isPlainRecord(query) || query.kind !== 'query') {
		throw new TypeError('upsert item query must expose a query AST')
	}

	const typedQuery: QueryAst<TSchema, QueryFilterNode<TSchema>> = input.query
		.ast

	if (typedQuery.selection.fields.length > 0) {
		throw new TypeError('bulk upsert query cannot select fields')
	}

	const normalizedInput = normalizeUpsertInput(schema, {
		create: input.create,
		update: input.update,
	})

	return immutableRecord({
		query: typedQuery,
		target: normalizeUniqueUpsertTarget(schema, typedQuery),
		...normalizedInput,
	})
}

/** Preserves developer item order while isolating later collection mutation. */
export const normalizeUpsertItems = <const TSchema extends SchemaDefinition>(
	schema: TSchema,
	inputs: readonly UpsertManyItemInput<TSchema>[],
): readonly UpsertOperationItem<TSchema, UpdateExpression<TSchema>>[] => {
	const untrustedInputs: unknown = inputs

	if (!isUnknownArray(untrustedInputs)) {
		throw new TypeError('bulk upsert items must be an array')
	}

	return immutableArray(
		inputs.map((input) => normalizeUpsertItem(schema, input)),
	)
}
