// A response's rows (D-129): the fields a request asked for, in its order,
// each relation's rows shaped as GraphQL returns them, and the levels and
// rows they nest, which the limits count.
import type { Relay } from '@ultimabase/http/internal'
import {
	connection,
	countedPage,
	rowOf,
	rowsOf,
} from '@ultimabase/http/internal'
import type { Row } from 'ultimabase'
import { isArgs } from './values.ts'

/** A field of the response, in the order the request wrote it. */
export type Out =
	| {
			readonly kind: 'scalar'
			readonly name: string
			readonly toJSON: ((value: unknown) => unknown) | undefined
	  }
	| { readonly kind: 'one'; readonly name: string; readonly shape: Shape }
	| {
			/** A `oneOf`, each kind it asks for a `one` of its own (D-247). */
			readonly kind: 'oneOf'
			readonly name: string
			readonly kinds: readonly {
				readonly kind: string
				readonly shape: Shape
			}[]
	  }
	| {
			readonly kind: 'many'
			readonly name: string
			readonly shape: Shape
			readonly relay: Relay | undefined
			/** The rows it asks for, which the row budget counts. */
			readonly size: number
			/** Whether it answers its `totalCount` (D-134). */
			readonly counted: boolean
	  }
	| {
			/** A virtual's rows of a model, re-read by the kernel (D-151). */
			readonly kind: 'returned'
			readonly name: string
			readonly owner: string
			readonly shape: Shape
			readonly list: boolean
			/** The rows it counts: `take` for a list, as a function's (D-109). */
			readonly size: number
	  }

/**
 * What a row of the response holds. `sorted` is the relations its list's
 * `orderBy` goes through, each a level of `maxDepth` (D-134).
 */
export type Shape = {
	readonly fields: readonly Out[]
	readonly sorted?: number
}

/** The levels of relations a row nests, the row counting one. */
export function depthOf(shape: Shape): number {
	let deepest = shape.sorted ?? 0
	for (const field of shape.fields) {
		// A `oneOf`'s kinds are one level, as a `one`'s target.
		if (field.kind === 'oneOf') {
			for (const { shape: kind } of field.kinds) {
				deepest = Math.max(deepest, depthOf(kind))
			}
		} else if (field.kind !== 'scalar') {
			deepest = Math.max(deepest, depthOf(field.shape))
		}
	}
	return 1 + deepest
}

/** The rows the relations of `times` rows may return, as D-107 counts them. */
export function rowsBelow(shape: Shape, times: number): number {
	let rows = 0
	for (const field of shape.fields) {
		if (field.kind === 'scalar') continue
		// A `oneOf` reads one row, of its kind that reads the most below.
		if (field.kind === 'oneOf') {
			const below = field.kinds.map(({ shape: kind }) => rowsBelow(kind, times))
			rows += times + Math.max(0, ...below)
			continue
		}
		const each = field.kind === 'one' ? times : times * field.size
		rows += each
		if (each > 0) rows += rowsBelow(field.shape, each)
	}
	return rows
}

/** The count the kernel read of a row's relation (D-134). */
function countOf(row: Row, name: string): unknown {
	const counts = row['_count']
	return isArgs(counts) ? counts[name] : undefined
}

/** A virtual's rows of a model, at most `take` under a relation (D-109). */
function returned(
	field: Extract<Out, { readonly kind: 'returned' }>,
	value: unknown,
): unknown {
	if (!field.list) {
		const row = rowOf(value)
		return row === undefined ? null : shaped(row, field.shape)
	}
	const rows = rowsOf(value)
	const relates = field.shape.fields.some((each) => each.kind !== 'scalar')
	if (rows.length > field.size && relates) {
		throw new RangeError(
			`${field.owner} returned ${rows.length} rows; a list counts take (${field.size}) rows, so it holds no more under a selected relation.`,
		)
	}
	return rows.map((row) => shaped(row, field.shape))
}

/**
 * A `oneOf` as GraphQL returns it: its kind, and each kind it asks for, the
 * row's or `null`; `null` when no kind is set or a rule hides it.
 */
function oneOfShaped(
	field: Extract<Out, { readonly kind: 'oneOf' }>,
	value: unknown,
): unknown {
	if (!isArgs(value)) return null
	const out: { [key: string]: unknown } = { kind: value['kind'] }
	for (const { kind, shape } of field.kinds) {
		const target = rowOf(value[kind])
		out[kind] = target === undefined ? null : shaped(target, shape)
	}
	return out
}

/** A row as GraphQL returns it: its fields, its relations' pages. */
export function shaped(row: Row, shape: Shape): { [field: string]: unknown } {
	const out: { [field: string]: unknown } = {}
	for (const field of shape.fields) {
		const value = row[field.name]
		if (field.kind === 'scalar') {
			out[field.name] =
				value === undefined || value === null
					? null
					: field.toJSON === undefined
						? value
						: field.toJSON(value)
		} else if (field.kind === 'one') {
			const target = rowOf(value)
			out[field.name] =
				target === undefined ? null : shaped(target, field.shape)
		} else if (field.kind === 'oneOf') {
			out[field.name] = oneOfShaped(field, value)
		} else if (field.kind === 'returned') {
			out[field.name] = returned(field, value)
		} else if (value === undefined || value === null) {
			// Hidden by its read rule (D-44), or a count alone (D-226).
			const count = countOf(row, field.name)
			out[field.name] =
				field.relay && field.counted && typeof count === 'number'
					? { ...countedPage(field.relay, count), totalCount: count }
					: null
		} else {
			const rows = rowsOf(value)
			const node = (each: Row) => shaped(each, field.shape)
			if (field.relay === undefined) {
				out[field.name] = rows.map(node)
				continue
			}
			const page = connection(rows, field.relay, node)
			out[field.name] = field.counted
				? { ...page, totalCount: countOf(row, field.name) }
				: page
		}
	}
	return out
}
