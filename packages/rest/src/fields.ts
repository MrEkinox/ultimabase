// `select` and `include` (D-129): what a request asks of a model's rows, as
// one kernel read, and the rows shaped as GraphQL returns them. Without
// either, a row holds its readable scalar fields and no relation.
import type { Relay } from '@ultimabase/http/internal'
import {
	pageArgs,
	pageOf,
	readable,
	readableOneOfs,
	readableVirtuals,
	readsNoRow,
} from '@ultimabase/http/internal'
import type { ExposedVirtual } from 'ultimabase'
import { InvalidQuery } from 'ultimabase'
import type { Api, Args, Entry } from './entries.ts'
import { entryOf, system } from './entries.ts'
import { oneOfRead } from './one-ofs.ts'
import type { Out, Shape } from './shapes.ts'
import { isArgs, unknownKey, whereOf } from './values.ts'

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

const scalar = (entry: Entry, name: string): Out => ({
	kind: 'scalar',
	name,
	// A plugin field reads as its toJSON gives (D-122).
	toJSON: entry.exposed.fieldTypes[name]?.toJSON,
})

/**
 * `id`, the dates, each scalar field a caller other than Master reads, and
 * each virtual of a scalar without an input (D-151).
 */
export const defaultShape = (entry: Entry): Shape => defaultsOf(entry).shape

/** The virtuals a row holds without `select` (D-151). */
export const defaultVirtuals = (entry: Entry): readonly string[] =>
	defaultsOf(entry).virtuals

type Defaults = { readonly shape: Shape; readonly virtuals: readonly string[] }

/** Each entry's defaults, built once: a function's rows read them each. */
const defaults = new WeakMap<Entry, Defaults>()

function defaultsOf(entry: Entry): Defaults {
	const known = defaults.get(entry)
	if (known !== undefined) return known
	const virtuals = readableVirtuals(entry)
		.filter((virtual) => virtual.default)
		.map((virtual) => virtual.name)
	const fields = [
		...system,
		...readable(entry)
			.filter((field) => field.kind === 'scalar')
			.map((field) => field.name),
		...virtuals,
	]
	const built = {
		shape: { fields: fields.map((name) => scalar(entry, name)) },
		virtuals,
	}
	defaults.set(entry, built)
	return built
}

// `take` for none or a negative number; above `maxTake`, the list refuses.
export const sizeOf = (entry: Entry, asked: unknown): number =>
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
			const virtual = readableVirtuals(entry).find((each) => each.name === name)
			if (virtual !== undefined) {
				if (value === false) continue
				const read = this.#virtual(entry, virtual, value, where)
				kernel[name] = read.read
				// `include` reads a default virtual again, where it is.
				const known = fields.findIndex((each) => each.name === name)
				if (known === -1) fields.push(read.field)
				else fields[known] = read.field
				continue
			}
			const oneOf = readableOneOfs(entry).find((each) => each.name === name)
			if (oneOf !== undefined) {
				if (value === false) continue
				const read = oneOfRead(
					model,
					oneOf,
					value,
					where,
					(target, inner, to) =>
						this.fields(entryOf(this.#api, target), inner, to),
				)
				kernel[name] = read.read
				fields.push(read.field)
				continue
			}
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
			const plain = field === undefined || field.kind === 'scalar'
			// An exists reads a boolean, as a scalar (D-246).
			if (plain || (field.kind === 'many' && field.exists)) {
				if (value !== true)
					throw new InvalidQuery(where, `${where} must be a boolean.`)
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
			// A count alone reads no row (D-226).
			if (!counted || !readsNoRow(many)) kernel[name] = many.read
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

	/** A virtual's read: `true` or its input, a model's fields too (D-151). */
	#virtual(
		entry: Entry,
		virtual: ExposedVirtual,
		value: unknown,
		where: string,
	): { readonly read: unknown; readonly field: Out } {
		const { name, output } = virtual
		if (output.kind !== 'model') {
			return { read: value, field: scalar(entry, name) }
		}
		if (value !== true && !isArgs(value)) {
			throw new InvalidQuery(where, `${where} must be true or an object.`)
		}
		const { select, include, ...input } = value === true ? {} : value
		const target = entryOf(this.#api, output.name)
		const nested = this.fields(target, { select, include }, where)
		const list = output.form === 'list'
		return {
			read: value === true ? true : { ...input, ...nested.read },
			field: {
				kind: 'returned',
				name,
				owner: `${entry.model.name}.${name}`,
				shape: nested.shape,
				list,
				size: list ? this.#api.take : 1,
			},
		}
	}

	/** A list's arguments: its page, filter, order and fields. */
	list(
		entry: Entry,
		args: Args,
		path: string,
	): Read & { readonly relay: Relay | undefined; readonly size: number } {
		const at = (key: string): string => (path === '' ? key : `${path}.${key}`)
		const paging = pageArgs(this.#api.pagination)
		const keys = ['select', 'include', 'where', 'orderBy', ...paging]
		this.#keys(args, keys, path, entry.model.name)
		const page = pageOf(this.#api.pagination, entry, args, this.#master, at)
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
