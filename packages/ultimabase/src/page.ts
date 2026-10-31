// A function's page (D-182): `Model.paginate` returns a source that reads
// nothing; a transport reads its rows and its count as it reads the model's
// generated list.
import type { Row } from './adapter.ts'
import { query } from './engine.ts'
import { InvalidQuery } from './errors.ts'
import type { OrderBy, Where } from './query.ts'
import { isObject } from './query-where.ts'

/** `Model.paginate`'s arguments: the rows of the page, in their order. */
export type PageQuery<F> = {
	readonly where?: Where<F> | undefined
	readonly orderBy?: OrderBy<F> | readonly OrderBy<F>[] | undefined
}

/** The rows a transport reads of a page, as `findMany` takes them. */
export type PageArgs = {
	readonly take?: number | undefined
	readonly skip?: number | undefined
	readonly cursor?: { readonly id: string } | undefined
}

/** What `Model.paginate` returns: rows and a count, read when asked (D-182). */
export interface Page<R> {
	findMany(this: void, page?: PageArgs): Promise<R[]>
	count(this: void): Promise<number>
}

/** A page as a transport reads it, with the arguments a client sent. */
export type PageSource = {
	findMany(this: void, page: object): Promise<Row[]>
	count(this: void): Promise<number>
}

/** Each page source, and the name of its model. */
const sources = new WeakMap<object, string>()

/** The keys of `given`, each one `keys` lists, or the read is refused. */
function only(given: unknown, keys: readonly string[], path: string): object {
	if (given === undefined) return {}
	if (!isObject(given)) throw new InvalidQuery(path, `${path} is an object.`)
	for (const key of Object.keys(given)) {
		if (keys.includes(key)) continue
		throw new InvalidQuery(
			`${path}.${key}`,
			`${path} takes ${keys.join(', ')}, not ${key}.`,
		)
	}
	return given
}

/** `Model.paginate(args, options)` of the model `model`. */
export function paginate(
	model: string,
	args: unknown,
	options: unknown,
): object {
	const kept = only(args, ['where', 'orderBy'], `${model}.paginate`)
	const where: unknown = Reflect.get(kept, 'where')
	const source: object = Object.freeze({
		findMany: async (page?: unknown): Promise<unknown> =>
			query(
				model,
				'findMany',
				{
					...kept,
					...only(page, ['take', 'skip', 'cursor'], 'page.findMany'),
				},
				options,
			),
		count: async (): Promise<unknown> =>
			query(model, 'count', where === undefined ? {} : { where }, options),
	})
	sources.set(source, model)
	return source
}

/**
 * The page `value` holds, for a transport: what `run` returned where the
 * output has `Model.paginated()`, a page of that model (D-182).
 */
export function pageSource(value: unknown, model: string): PageSource {
	const of = isObject(value) ? sources.get(value) : undefined
	if (of === model && isObject(value)) {
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the value `paginate` built, whose reads return the model's rows.
		return value as unknown as PageSource
	}
	throw new TypeError(
		`Expected ${model}.paginate(…), got ${of === undefined ? 'another value' : `a page of ${of}`}.`,
	)
}
