import { Buffer } from 'node:buffer'

import { Schema, type SchemaDefinition } from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { QueryOrderingNode } from '../ast/contracts.js'
import { normalizeInputOrdering } from '../query/input.js'
import type { QueryPosition } from '../query/input-contracts.js'
import { readPersistedQueryFields } from '../ast/schema.js'
import {
	completeQueryOrdering,
	createInvalidPositionError,
	readQueryPosition,
} from './position.js'

/** The `orderBy` of the `findMany` whose rows a cursor positions. */
export type QueryCursorOrderBy = Readonly<
	Record<string, 'asc' | 'desc' | null | undefined>
>

const cursorVersion = 1
const maximumCursorLength = 4096
const base64urlPattern = /^[0-9A-Za-z_-]+$/u
const integerPattern = /^-?(?:0|[1-9]\d*)$/u
const utf8 = new TextDecoder('utf-8', { fatal: true })

type WireOrder = readonly [field: string, direction: 'a' | 'd']

const readOrdering = (
	schema: SchemaDefinition,
	orderBy: QueryCursorOrderBy | undefined,
): QueryOrderingNode =>
	completeQueryOrdering(
		orderBy === undefined
			? normalizeInputOrdering(schema, {})
			: normalizeInputOrdering(schema, orderBy),
	)

const wireOrdering = (ordering: QueryOrderingNode): readonly WireOrder[] =>
	ordering.orders.map(({ direction, field }) => [
		field,
		direction === 'ascending' ? 'a' : 'd',
	])

const fieldKind = (schema: SchemaDefinition, field: string): string =>
	readPersistedQueryFields(schema)[field]?.kind ?? ''

/** Encodes one logical value as JSON; `bigint` and binary need a string. */
const encodeValue = (kind: string, value: unknown): unknown => {
	if (value === null) return null
	if (kind === 'bigint' && typeof value === 'bigint') return value.toString(10)
	if (kind === 'binary' && value instanceof Uint8Array) {
		return Buffer.from(value).toString('base64url')
	}
	return value
}

const decodeValue = (kind: string, value: unknown): unknown => {
	if (value === null) return null
	if (kind === 'bigint') {
		if (typeof value !== 'string' || !integerPattern.test(value)) {
			throw createInvalidPositionError('cursor holds an invalid bigint')
		}
		return BigInt(value)
	}
	if (kind === 'binary') {
		if (typeof value !== 'string' || !base64urlPattern.test(value)) {
			throw createInvalidPositionError('cursor holds invalid binary data')
		}
		return new Uint8Array(Buffer.from(value, 'base64url'))
	}
	return value
}

const assertCursorSchema = (schema: unknown): SchemaDefinition => {
	if (!Schema.is(schema)) {
		throw new TypeError('cursor schema must be created by App.Schema.define')
	}
	return schema
}

/**
 * Encodes the position of one received row into an opaque base64url cursor
 * of at most 4096 characters: version, schema name, the `orderBy` completed
 * by `id`, and the ordered values of the row (ADR-0309). The row must contain
 * every ordered field and `id`.
 *
 * @example `const nextCursor = encodeQueryCursor(Todo, { title: 'asc' }, rows.at(-1))`
 */
export const encodeQueryCursor = (
	schema: SchemaDefinition,
	orderBy: QueryCursorOrderBy | undefined,
	row: unknown,
): string => {
	const definition = assertCursorSchema(schema)
	const ordering = readOrdering(definition, orderBy)
	const values = readQueryPosition(definition, ordering, row).map(
		({ field, value }) => encodeValue(fieldKind(definition, field), value),
	)
	const cursor = Buffer.from(
		JSON.stringify({
			v: cursorVersion,
			s: definition.className,
			o: wireOrdering(ordering),
			p: values,
		}),
		'utf8',
	).toString('base64url')

	if (cursor.length > maximumCursorLength) {
		throw createInvalidPositionError(
			`cursor exceeds ${String(maximumCursorLength)} characters`,
			'is too long to encode',
		)
	}

	return cursor
}

const parseCursor = (cursor: unknown): Readonly<Record<string, unknown>> => {
	if (
		typeof cursor !== 'string' ||
		cursor.length === 0 ||
		cursor.length > maximumCursorLength ||
		!base64urlPattern.test(cursor)
	) {
		throw createInvalidPositionError('cursor is malformed')
	}

	let payload: unknown

	try {
		payload = JSON.parse(utf8.decode(Buffer.from(cursor, 'base64url')))
	} catch {
		throw createInvalidPositionError('cursor is malformed')
	}

	if (!isPlainRecord(payload)) {
		throw createInvalidPositionError('cursor is malformed')
	}

	return payload
}

const sameOrdering = (
	received: unknown,
	expected: readonly WireOrder[],
): boolean =>
	isUnknownArray(received) &&
	received.length === expected.length &&
	received.every((order, index) => {
		const [field, direction] = expected[index] ?? []
		return (
			isUnknownArray(order) &&
			order.length === 2 &&
			order[0] === field &&
			order[1] === direction
		)
	})

/**
 * Decodes a cursor of {@link encodeQueryCursor} into the `after` position of
 * a `findMany` with the same schema and `orderBy`. A malformed cursor, or one
 * for another schema or ordering, fails with `VALIDATION_ERROR`
 * (`publicDetails: { parameter: 'after' }`); Core validates the values again
 * when the position is used.
 *
 * @example `await Todo.findMany({ orderBy, take, after: decodeQueryCursor(Todo, orderBy, cursor) })`
 */
export const decodeQueryCursor = (
	schema: SchemaDefinition,
	orderBy: QueryCursorOrderBy | undefined,
	cursor: unknown,
): QueryPosition => {
	const definition = assertCursorSchema(schema)
	const ordering = wireOrdering(readOrdering(definition, orderBy))
	const payload = parseCursor(cursor)
	const { o, p, s, v } = payload

	if (
		Object.keys(payload).length !== 4 ||
		v !== cursorVersion ||
		s !== definition.className ||
		!sameOrdering(o, ordering) ||
		!isUnknownArray(p) ||
		p.length !== ordering.length
	) {
		throw createInvalidPositionError(
			'cursor does not match this schema and ordering',
		)
	}

	const values = immutableArray(p)
	const entries = ordering.map(([field], index): [string, unknown] => [
		field,
		decodeValue(fieldKind(definition, field), values[index]),
	])

	// Field names come from the schema; `Object.fromEntries` keeps each own key.
	const position: Readonly<Record<string, unknown>> =
		Object.fromEntries(entries)
	const { id } = position

	if (typeof id !== 'string') {
		throw createInvalidPositionError('cursor holds an invalid id')
	}

	return immutableRecord({ ...position, id })
}
