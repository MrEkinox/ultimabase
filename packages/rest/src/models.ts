// A model's routes (D-129): its list, its row, and its three writes, each
// one kernel query run as the request's caller, answered with the JSON the
// matching GraphQL field returns.
import type { Routes, StandardSchema } from '@ultimabase/http'
import { validate } from '@ultimabase/http'
import type { Caller, Row } from 'ultimabase'
import { PublicError } from 'ultimabase'
import type { Api, Args, Entry } from './entries.ts'
import { badInput, run } from './errors.ts'
import type { Read, Shape } from './fields.ts'
import {
	defaultShape,
	depthOf,
	filterOf,
	readerOf,
	rowsBelow,
	shaped,
} from './fields.ts'
import { connection, pageArgs } from './pages.ts'
import type { Accepted } from './params.ts'
import { paramsOf } from './params.ts'
import { dataOf, isArgs } from './values.ts'

/** Any JSON body: the kernel checks the data (D-129). */
export const anyBody: StandardSchema = {
	'~standard': { validate: (value) => ({ value }) },
}

const fieldParams: Accepted = { json: ['select', 'include'], text: [] }

/** The rows a request may return, refused above the limits unless Master's. */
function bounded(api: Api, caller: Caller, shape: Shape, rows: number): void {
	if (caller.kind === 'master') return
	const depth = depthOf(shape)
	if (depth > api.maxDepth) {
		throw badInput(
			`The request is nested ${depth} levels deep; the most is ${api.maxDepth}.`,
		)
	}
	if (rows + rowsBelow(shape, rows) <= api.maxRows) return
	const fewer = api.pagination === 'list' ? 'take' : 'first or last'
	throw badInput(
		`The request asks for more than ${api.maxRows.toLocaleString('en-US')} rows. Ask for fewer with ${fewer}.`,
	)
}

/** The kernel read of one row's `select` or `include`. */
function oneRead(api: Api, entry: Entry, caller: Caller, url: string): Read {
	const params = paramsOf(url, fieldParams)
	const read = readerOf(api, caller.kind === 'master').fields(entry, params, '')
	bounded(api, caller, read.shape, 1)
	return read
}

/** `GET /api/posts`: a connection, or a list with `pagination: 'list'`. */
async function list(
	api: Api,
	entry: Entry,
	caller: Caller,
	url: string,
): Promise<unknown> {
	const counts = api.pagination === 'connection'
	const params = paramsOf(url, {
		json: [
			'where',
			'orderBy',
			'select',
			'include',
			...pageArgs(api).filter((arg) => arg !== 'after' && arg !== 'before'),
			...(counts ? ['totalCount'] : []),
		],
		text: counts ? ['after', 'before'] : [],
	})
	const { totalCount, ...args } = params
	if (totalCount !== undefined && typeof totalCount !== 'boolean') {
		throw badInput('totalCount must be true or false.')
	}
	const read = readerOf(api, caller.kind === 'master').list(entry, args, '')
	// A count reads the rows it counts, however few the page returns.
	const size = totalCount === true ? Math.max(read.size, entry.take) : read.size
	bounded(api, caller, read.shape, size)
	const { queries } = entry.exposed
	const rows = await queries.findMany(read.read, { as: caller })
	const node = (row: Row) => shaped(row, read.shape)
	if (read.relay === undefined) return rows.map(node)
	const page = connection(rows, read.relay, node)
	if (totalCount !== true) return page
	const where = filterOf(api, entry, args['where'], 'where')
	return { ...page, totalCount: await queries.count(where, { as: caller }) }
}

const notFound = (entry: Entry): Error =>
	new PublicError('NOT_FOUND', `No ${entry.model.name} matches.`)

const written = (api: Api, entry: Entry, body: unknown): unknown =>
	isArgs(body) ? dataOf(api, entry.model.name, body, 'data') : body

/** Each route of a visible model, under `base`. */
export function modelRoutes(
	app: Routes,
	api: Api,
	entry: Entry,
	base: string,
): void {
	const path = `${base}/${entry.plural}`
	const { queries } = entry.exposed
	app.get(path, async (c) =>
		c.json(await run(() => list(api, entry, c.var.caller, c.req.url))),
	)
	app.get(`${path}/:id`, async (c) => {
		const { caller } = c.var
		const { row, shape } = await run(async () => {
			const fields = oneRead(api, entry, caller, c.req.url)
			const where = { id: c.req.param('id') }
			const found = await queries.findUnique(
				{ ...fields.read, where },
				{ as: caller },
			)
			return { row: found, shape: fields.shape }
		})
		if (row === null) throw notFound(entry)
		return c.json(shaped(row, shape))
	})
	app.post(path, validate('json', anyBody), async (c) => {
		const { caller } = c.var
		const body: unknown = c.req.valid('json')
		const { read, shape } = await run(async () => {
			const fields = oneRead(api, entry, caller, c.req.url)
			const data = written(api, entry, body)
			const row = await queries.create({ ...fields.read, data }, { as: caller })
			return { read: row, shape: fields.shape }
		})
		return c.json(shaped(read, shape), 201)
	})
	app.patch(`${path}/:id`, validate('json', anyBody), async (c) => {
		const { caller } = c.var
		const body: unknown = c.req.valid('json')
		const { read, shape } = await run(async () => {
			const fields = oneRead(api, entry, caller, c.req.url)
			const data = written(api, entry, body)
			const where = { id: c.req.param('id') }
			const args: Args = { ...fields.read, where, data }
			const row = await queries.update(args, { as: caller })
			return { read: row, shape: fields.shape }
		})
		return c.json(shaped(read, shape))
	})
	app.delete(`${path}/:id`, async (c) => {
		const { caller } = c.var
		const row = await run(async () => {
			paramsOf(c.req.url, { json: [], text: [] })
			return queries.delete(
				{ where: { id: c.req.param('id') } },
				{ as: caller },
			)
		})
		// As it was, without its relations (D-102).
		return c.json(shaped(row, defaultShape(entry)))
	})
}
