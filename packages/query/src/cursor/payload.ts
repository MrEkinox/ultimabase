import type { SchemaDefinition } from '@ultimabase/schema'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	QueryFieldName,
	QueryOrderingNode,
	QueryOrderDirection,
} from '../ast/contracts.js'
import type {
	QueryCursor,
	QueryCursorCodec,
	QueryCursorOrderValue,
	QueryCursorPayload,
} from './contracts.js'
import { queryCursorVersion } from './contracts.js'
import { QueryCursorError } from './error.js'
import { normalizeQueryCursorOrdering } from './ordering.js'

/** Supplies the persisted values used by every normalized cursor order term. */
export type QueryCursorValues<TSchema extends SchemaDefinition> = Readonly<
	Partial<Record<QueryFieldName<TSchema>, unknown>>
>

const invalidCursor = (message: string, cause?: unknown): QueryCursorError =>
	new QueryCursorError(
		'CURSOR_INVALID',
		message,
		cause === undefined ? undefined : { cause },
	)

const incompatibleCursor = (message: string): QueryCursorError =>
	new QueryCursorError('CURSOR_INCOMPATIBLE', message)

const parseCursorDirection = (
	value: unknown,
	path: string,
): QueryOrderDirection => {
	if (value !== 'ascending' && value !== 'descending') {
		throw invalidCursor(`${path} must be ascending or descending`)
	}

	return value
}

const parseCursorOrderValue = (
	value: unknown,
	index: number,
): QueryCursorOrderValue => {
	const path = `cursor.ordering[${String(index)}]`

	if (!isPlainRecord(value)) {
		throw invalidCursor(`${path} must be an object`)
	}

	if (typeof value.field !== 'string' || value.field.length === 0) {
		throw invalidCursor(`${path}.field must be a non-empty string`)
	}

	if (!Object.hasOwn(value, 'value')) {
		throw invalidCursor(`${path}.value must be present`)
	}

	return immutableRecord({
		field: value.field,
		direction: parseCursorDirection(value.direction, `${path}.direction`),
		value: value.value,
	})
}

const parseCursorPayload = (value: unknown): QueryCursorPayload => {
	if (!isPlainRecord(value)) {
		throw invalidCursor('cursor payload must be an object')
	}

	if (value.version !== queryCursorVersion) {
		if (typeof value.version === 'number') {
			throw incompatibleCursor('cursor payload version is not supported')
		}

		throw invalidCursor('cursor payload version must be present')
	}

	if (typeof value.className !== 'string' || value.className.length === 0) {
		throw invalidCursor('cursor payload className must be a non-empty string')
	}

	if (!isUnknownArray(value.ordering) || value.ordering.length === 0) {
		throw invalidCursor('cursor payload ordering must be a non-empty array')
	}

	const ordering = Array.from(value.ordering, parseCursorOrderValue)

	if (ordering.at(-1)?.field !== 'id') {
		throw invalidCursor('cursor payload ordering must end with id')
	}

	return immutableRecord({
		version: queryCursorVersion,
		className: value.className,
		ordering: immutableArray(ordering),
	})
}

/** Creates the authenticated payload source from one returned database object. */
export const createQueryCursorPayload = <
	const TSchema extends SchemaDefinition,
>(
	schema: TSchema,
	ordering: QueryOrderingNode<QueryFieldName<TSchema>>,
	values: QueryCursorValues<TSchema>,
): QueryCursorPayload<QueryFieldName<TSchema>> => {
	const stableOrdering = normalizeQueryCursorOrdering(schema, ordering.orders)
	const untrustedValues: unknown = values

	if (!isPlainRecord(untrustedValues)) {
		throw new TypeError('cursor values must be an object')
	}

	const cursorOrdering = stableOrdering.orders.map((order) => {
		if (!Object.hasOwn(untrustedValues, order.field)) {
			throw new TypeError(
				`cursor values must include ordered field ${order.field}`,
			)
		}

		return immutableRecord({
			field: order.field,
			direction: order.direction,
			value: untrustedValues[order.field],
		})
	})

	return immutableRecord({
		version: queryCursorVersion,
		className: schema.className,
		ordering: immutableArray(cursorOrdering),
	})
}

/** Delegates authenticated encoding while validating the adapter result. */
export const sealQueryCursor = async (
	codec: QueryCursorCodec,
	payload: QueryCursorPayload,
): Promise<QueryCursor> => {
	const normalizedPayload = parseCursorPayload(payload)
	const cursor = await codec.seal(normalizedPayload)

	if (typeof cursor !== 'string' || cursor.length === 0) {
		throw new TypeError('cursor codec seal must return a non-empty string')
	}

	return cursor as QueryCursor
}

/** Authenticates and checks a cursor against its exact schema and ordering. */
export const unsealQueryCursor = async <const TSchema extends SchemaDefinition>(
	codec: QueryCursorCodec,
	cursor: string,
	schema: TSchema,
	ordering: QueryOrderingNode<QueryFieldName<TSchema>>,
): Promise<QueryCursorPayload<QueryFieldName<TSchema>>> => {
	if (typeof cursor !== 'string' || cursor.length === 0) {
		throw invalidCursor('cursor must be a non-empty string')
	}

	let untrustedPayload: unknown

	try {
		untrustedPayload = await codec.unseal(cursor)
	} catch (cause: unknown) {
		throw invalidCursor('cursor is invalid or has been modified', cause)
	}

	const payload = parseCursorPayload(untrustedPayload)
	const stableOrdering = normalizeQueryCursorOrdering(schema, ordering.orders)

	if (payload.className !== schema.className) {
		throw incompatibleCursor('cursor belongs to another schema')
	}

	if (payload.ordering.length !== stableOrdering.orders.length) {
		throw incompatibleCursor('cursor ordering does not match the query')
	}

	const cursorOrderingSignature = payload.ordering
		.map((order) => `${order.field}:${order.direction}`)
		.join('|')
	const expectedOrderingSignature = stableOrdering.orders
		.map((order) => `${order.field}:${order.direction}`)
		.join('|')

	if (cursorOrderingSignature !== expectedOrderingSignature) {
		throw incompatibleCursor('cursor ordering does not match the query')
	}

	const valuesByField = new Map(
		payload.ordering.map((order) => [order.field, order.value]),
	)
	const compatibleOrdering = stableOrdering.orders.map((expected) =>
		immutableRecord({
			field: expected.field,
			direction: expected.direction,
			value: valuesByField.get(expected.field),
		}),
	)

	return immutableRecord({
		version: queryCursorVersion,
		className: schema.className,
		ordering: immutableArray(compatibleOrdering),
	})
}
