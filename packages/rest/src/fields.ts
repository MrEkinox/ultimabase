// `select` and `include` (D-129): what a request asks of a model's rows, as
// one kernel read, and the rows shaped as GraphQL returns them. Without
// either, a row holds its readable scalar fields and no relation.
import type { Row } from 'ultimabase'
import { InvalidQuery } from 'ultimabase'
import type { Api, Args, Entry } from './entries.ts'
import { entryOf, readable, system } from './entries.ts'
import type { Relay } from './pages.ts'
import { connection, pageArgs, pageOf, rowOf, rowsOf } from './pages.ts'
import { isArgs, whereOf } from './values.ts'

/** A field of the response, in the order the request wrote it. */
type Out =
	| {
			readonly kind: 'scalar'
			readonly name: string
			readonly toJSON: ((value: unknown) => unknown) | undefined
	  }
	| { readonly kind: 'one'; readonly name: string; readonly shape: Shape }
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

/**
 * What a row of the response holds. `sorted` is the relations its list's
 * `orderBy` goes through, each a level of `maxDepth` (D-134).
 */
export type Shape = {
	readonly fields: readonly Out[]
	readonly sorted?: number
}

/** A row's fields and its relations' reads, as the kernel takes them. */
export type Read = {
	readonly read: Args
	readonly shape: Shape
}

/** The relations an `orderBy` goes through, the deepest path's. */
function sortDepth(orderBy: unknown): number {
	if (Array.isArray(orderBy)) return Math.max(0, ...orderBy.map(sortDepth))
	if (typeof orderBy !== 'object' || orderBy === null) return 0
	return Math.max(
		0,
		...Object.values(orderBy).map((value: unknown) =>
			typeof value === 'object' && value !== null ? 1 + sortDepth(value) : 0,
		),
	)
}

const unknownKey = (path: string, model: string): InvalidQuery =>
	new InvalidQuery(path, `Unknown key '${path}' on ${model}.`)

const scalar = (entry: Entry, name: string): Out => ({
	kind: 'scalar',
	name,
	// A plugin field reads as its toJSON gives (D-122).
	toJSON: entry.exposed.fieldTypes[name]?.toJSON,
})

/** `id`, the dates and each scalar field a caller other than Master reads. */
export const defaultShape = (entry: Entry): Shape => ({
	fields: [
		...system.map((name) => scalar(entry, name)),
		...readable(entry)
			.filter((field) => field.kind === 'scalar')
			.map((field) => scalar(entry, field.name)),
	],
})

// `take` for none or a negative number; above `maxTake`, the list refuses.
const sizeOf = (entry: Entry, asked: unknown): number =>
	typeof asked === 'number' && asked >= 0
		? Math.min(asked, entry.maxTake)
		: entry.take

/** A list's `where`, its dates read; `null` is absent, as in GraphQL. */
export const filterOf = (
	api: Api,
	entry: Entry,
	where: unknown,
	path: string,
): Args =>
	where === undefined || where === null
		? {}
		: {
				where: isArgs(where)
					? whereOf(api, entry.model.name, where, path)
					: where,
			}

/** Reads `select` or `include` as the request wrote them. */
class Reader {
	readonly #api: Api
	readonly #master: boolean

	constructor(api: Api, master: boolean) {
		this.#api = api
		this.#master = master
	}

	/** A row's `select` or `include`, under `path` (`''` at the root). */
	fields(entry: Entry, args: Args, path: string): Read {
		const at = (key: string): string => (path === '' ? key : `${path}.${key}`)
		const { select, include } = args
		if (select !== undefined && include !== undefined) {
			throw new InvalidQuery(
				path,
				`${at('select')} and include cannot be used together.`,
			)
		}
		const base = select === undefined ? 'include' : 'select'
		const chosen = select ?? include
		if (chosen === undefined) return { read: {}, shape: defaultShape(entry) }
		if (!isArgs(chosen)) {
			throw new InvalidQuery(at(base), `${at(base)} must be an object.`)
		}
		const kernel: { [field: string]: unknown } =
			base === 'select' ? { id: true } : {}
		const fields: Out[] =
			base === 'select' ? [] : [...defaultShape(entry).fields]
		// The relations' `totalCount`, each the count of its `where` (D-134).
		const counts: { [field: string]: unknown } = {}
		const model = entry.model.name
		for (const [name, value] of Object.entries(chosen)) {
			const where = `${at(base)}.${name}`
			const field = readable(entry).find((each) => each.name === name)
			const isScalar =
				field === undefined ? system.includes(name) : field.kind === 'scalar'
			if (
				(field === undefined && !isScalar) ||
				(base === 'include' && isScalar)
			) {
				throw unknownKey(where, model)
			}
			if (value === false) continue
			if (field === undefined || field.kind === 'scalar') {
				if (value !== true) {
					throw new InvalidQuery(where, `${where} must be a boolean.`)
				}
				kernel[name] = true
				fields.push(scalar(entry, name))
				continue
			}
			const target = entryOf(this.#api, field.target)
			const given = value === true ? {} : value
			if (!isArgs(given)) {
				throw new InvalidQuery(where, `${where} must be an object.`)
			}
			if (field.kind === 'one') {
				this.#keys(given, ['select', 'include'], where, model)
				const nested = this.fields(target, given, where)
				kernel[name] = nested.read
				fields.push({ kind: 'one', name, shape: nested.shape })
				continue
			}
			// A list has no count (D-134): `totalCount` is unknown there.
			const pages = this.#api.pagination === 'connection'
			const { totalCount, ...listed } = given
			const many = this.list(target, pages ? listed : given, where)
			const counted = pages && totalCount === true
			if (
				pages &&
				totalCount !== undefined &&
				typeof totalCount !== 'boolean'
			) {
				const key = `${where}.totalCount`
				throw new InvalidQuery(key, `${key} must be true or false.`)
			}
			if (counted) {
				const filter = many.read['where']
				counts[name] = filter === undefined ? true : { where: filter }
			}
			kernel[name] = many.read
			fields.push({
				kind: 'many',
				name,
				shape: many.shape,
				relay: many.relay,
				// A count reads the rows it counts, however few the page returns.
				size: counted ? Math.max(many.size, target.take) : many.size,
				counted,
			})
		}
		if (Object.keys(counts).length > 0) kernel['_count'] = { select: counts }
		return { read: { [base]: kernel }, shape: { fields } }
	}

	/** A list's arguments: its page, filter, order and fields. */
	list(
		entry: Entry,
		args: Args,
		path: string,
	): Read & { readonly relay: Relay | undefined; readonly size: number } {
		const at = (key: string): string => (path === '' ? key : `${path}.${key}`)
		const paging = pageArgs(this.#api)
		const keys = ['select', 'include', 'where', 'orderBy', ...paging]
		this.#keys(args, keys, path, entry.model.name)
		const page = pageOf(this.#api, entry, args, this.#master, at)
		const { where, orderBy } = args
		const nested = this.fields(entry, args, path)
		const asked =
			this.#api.pagination === 'list'
				? args['take']
				: (args['last'] ?? args['first'])
		return {
			read: {
				...nested.read,
				...page.read,
				...filterOf(this.#api, entry, where, at('where')),
				...(orderBy === undefined || orderBy === null ? {} : { orderBy }),
			},
			shape: { ...nested.shape, sorted: sortDepth(orderBy) },
			relay: page.relay,
			size: sizeOf(entry, asked),
		}
	}

	#keys(args: Args, keys: readonly string[], path: string, model: string) {
		for (const key of Object.keys(args)) {
			if (!keys.includes(key)) {
				throw unknownKey(path === '' ? key : `${path}.${key}`, model)
			}
		}
	}
}

/** The reader of a request's `select` and `include`. */
export const readerOf = (api: Api, master: boolean): Reader =>
	new Reader(api, master)

/** The levels of relations a row nests, the row counting one. */
export function depthOf(shape: Shape): number {
	let deepest = shape.sorted ?? 0
	for (const field of shape.fields) {
		if (field.kind !== 'scalar')
			deepest = Math.max(deepest, depthOf(field.shape))
	}
	return 1 + deepest
}

/** The rows the relations of `times` rows may return, as D-107 counts them. */
export function rowsBelow(shape: Shape, times: number): number {
	let rows = 0
	for (const field of shape.fields) {
		if (field.kind === 'scalar') continue
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
		} else if (value === undefined || value === null) {
			// Absent when the field's read rule hides it (D-44).
			out[field.name] = null
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
