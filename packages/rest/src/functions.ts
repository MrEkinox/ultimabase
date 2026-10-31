// The application's functions (D-129): a query at `GET /api/functions/:name`,
// its input keys as query parameters, a mutation at `POST`, its body as its
// input, each answered with the output GraphQL's field returns; a live query
// over Server-Sent Events, with `Accept: text/event-stream` (D-154).
import type { Routes } from '@ultimabase/http'
import { clientOf, validate } from '@ultimabase/http'
import type { Node } from '@ultimabase/http/internal'
import { isNode, jsonSchemaOf, rowOf, run } from '@ultimabase/http/internal'
import type { Caller, Client, ExposedFunction, ExposedOutput } from 'ultimabase'
import { Refused } from 'ultimabase'
import type { Api, Entry } from './entries.ts'
import { checkName, entryOf } from './entries.ts'
import { defaultShape, defaultVirtuals, shaped } from './fields.ts'
import type { Paging } from './function-pages.ts'
import { pageParams, pagesOf, pagingOf, readPage } from './function-pages.ts'
import { acceptsNull, isText, resolved } from './json-schema.ts'
import { anyBody } from './models.ts'
import type { Accepted } from './params.ts'
import { liveValue, wantsEvents } from './live.ts'
import { paramsOf } from './params.ts'
import type { Live } from './streams.ts'

/** A function's key of `.with` (D-129): its route's name, or hidden. */
export type RestFunctionWith = { readonly name?: string } | false

const none: Accepted = { json: [], text: [] }

/** A function REST routes, named, and its input's JSON Schema. */
export type Routed = {
	readonly fn: ExposedFunction<RestFunctionWith>
	readonly owner: string
	readonly name: string
	readonly input: Node | undefined
}

/**
 * A GET's parameters: an object input's keys, as GraphQL's arguments, or
 * one `input`; a string as is, any other value as JSON.
 */
export function getParams(root: Node | undefined): {
	readonly accepted: Accepted
	readonly flat: boolean
} {
	if (root === undefined) return { accepted: none, flat: false }
	const object = resolved(root, root)
	const { properties } = object
	if (object['type'] === 'object' && isNode(properties)) {
		const keys = Object.entries(properties)
		const text = (node: unknown) => isNode(node) && isText(node, root)
		return {
			accepted: {
				json: keys.filter(([, node]) => !text(node)).map(([key]) => key),
				text: keys.filter(([, node]) => text(node)).map(([key]) => key),
			},
			flat: true,
		}
	}
	const as = isText(root, root) ? 'text' : 'json'
	return { accepted: { ...none, [as]: ['input'] }, flat: false }
}

/** The rows of each model whose default virtuals are read again. */
type Pending = Map<Entry, { id: string; copy: { [field: string]: unknown } }[]>

const nonNull = (where: string): TypeError =>
	new TypeError(`Cannot return null for non-nullable field ${where}.`)

/** What a function's answer reads its output with. */
type Reading = {
	readonly api: Api
	readonly pending: Pending
	readonly paging: ReadonlyMap<string, Paging>
}

/** A row as a model's output returns it, its default virtuals read after. */
function rowOut(reading: Reading, model: string, value: unknown): unknown {
	const row = rowOf(value)
	if (row === undefined) {
		throw new TypeError(`A ${model} was returned without its id.`)
	}
	const entry = entryOf(reading.api, model)
	const copy = shaped(row, defaultShape(entry))
	if (defaultVirtuals(entry).length > 0) {
		const { pending } = reading
		pending.set(entry, [...(pending.get(entry) ?? []), { id: row.id, copy }])
	}
	return copy
}

/**
 * A value as GraphQL returns a function's output, a model's row its scalars,
 * a page read as `path`'s parameters ask (D-182).
 */
async function outputOf(
	reading: Reading,
	output: ExposedOutput,
	value: unknown,
	where: string,
	path: string,
): Promise<unknown> {
	if (output.kind === 'schema') return value ?? null
	if (output.kind === 'page') {
		const paging = reading.paging.get(path)
		if (paging === undefined) throw new TypeError(`${where} was not paged.`)
		return readPage(output.name, value, paging, (row) =>
			rowOut(reading, output.name, row),
		)
	}
	if (value === null || value === undefined) {
		if (output.form === 'nullable') return null
		throw nonNull(where)
	}
	if (output.form === 'list') {
		const items: readonly unknown[] = Array.isArray(value) ? value : []
		const item = { ...output, form: 'one' } as const
		return Promise.all(
			items.map(async (each) => outputOf(reading, item, each, where, path)),
		)
	}
	if (output.kind === 'model') return rowOut(reading, output.name, value)
	const given: Node = isNode(value) ? value : {}
	const { type } = output
	const fields = [...type.fields].map(async ([name, field]) => [
		name,
		await outputOf(
			reading,
			field,
			given[name],
			`${type.name}.${name}`,
			path === '' ? name : `${path}.${name}`,
		),
	])
	return Object.fromEntries(await Promise.all(fields))
}

/** The default virtuals of a function's rows, read by id as the caller (D-151). */
async function withVirtuals(pending: Pending, as: Caller): Promise<void> {
	for (const [entry, rows] of pending) {
		const names = defaultVirtuals(entry)
		const ids = [...new Set(rows.map(({ id }) => id))]
		const found = await entry.exposed.queries.findMany(
			{
				where: { id: { in: ids } },
				take: ids.length,
				select: Object.fromEntries([
					['id', true],
					...names.map((name) => [name, true]),
				]),
			},
			{ as },
		)
		const byId = new Map(found.map((row) => [row.id, row]))
		for (const { id, copy } of rows) {
			// A row the caller cannot read has none (D-109).
			for (const name of names) copy[name] = byId.get(id)?.[name] ?? null
		}
	}
}

/** Each routed function under `${base}/functions` (D-109, D-113). */
export function functionRoutes(
	app: Routes,
	api: Api,
	functions: readonly ExposedFunction<RestFunctionWith>[],
	base: string,
	live: Live | undefined,
): readonly Routed[] {
	const routed: Routed[] = []
	const owners = new Map<string, string>()
	for (const fn of functions) {
		if (fn.with === false) continue
		// A plugin's function is named with its plugin (D-113).
		const owner = fn.plugin === undefined ? fn.name : `${fn.plugin}.${fn.name}`
		const name = checkName(fn.with?.name ?? fn.name, owner)
		const other = owners.get(name)
		if (other !== undefined) {
			throw new Refused(
				`${owner}: the route functions/${name} is ${other}'s; set .with({ rest: { name } }).`,
			)
		}
		owners.set(name, owner)
		// GraphQL types both sides from their exports, and refuses without (D-45).
		const { input, output } = fn
		const root =
			input === undefined
				? undefined
				: jsonSchemaOf(input, 'input', `${owner}: input`)
		routed.push({ fn, owner, name, input: root })
		const nullable =
			output?.kind === 'schema'
				? acceptsNull(jsonSchemaOf(output.schema, 'output', `${owner}: output`))
				: output !== undefined &&
					output.kind !== 'page' &&
					output.form === 'nullable'
		const pages = pagesOf(output)
		const answer = async (
			as: Caller,
			client: Client,
			sent: unknown,
			paging: ReadonlyMap<string, Paging> = new Map(),
		) => {
			const value = await fn.run(sent, { as }, client)
			if (output === undefined) return true
			if (value === undefined && !nullable) {
				throw new TypeError(
					`${fn.name} returned undefined; make its output .nullable() and return null.`,
				)
			}
			const reading = { api, pending: new Map(), paging }
			const answered = await outputOf(reading, output, value, fn.name, '')
			await withVirtuals(reading.pending, as)
			return answered
		}
		const path = `${base}/functions/${name}`
		if (fn.query) {
			const { accepted, flat } = getParams(root)
			const paged = pageParams(api, owner, pages, accepted)
			const names = [...paged.json, ...paged.text]
			app.get(path, async (c) => {
				const params = paramsOf(c.req.url, {
					json: [...accepted.json, ...paged.json],
					text: [...accepted.text, ...paged.text],
				})
				const { client, sent } = clientOf(c)
				const inputs = Object.fromEntries(
					Object.entries(params).filter(([key]) => !names.includes(key)),
				)
				const given = flat ? inputs : params['input']
				if (wantsEvents(c.req.raw)) {
					const compute = async (as: Caller) => answer(as, client, given)
					return sent(await liveValue(live, owner, c.req.raw, compute))
				}
				const { caller } = c.var
				const paging = await run(async () =>
					pagingOf(api, caller, pages, params),
				)
				return sent(c.json(await answer(caller, client, given, paging)))
			})
		} else if (input === undefined) {
			app.post(path, async (c) => {
				paramsOf(c.req.url, none)
				const { client, sent } = clientOf(c)
				return sent(c.json(await answer(c.var.caller, client, undefined)))
			})
		} else {
			app.post(path, validate('json', anyBody), async (c) => {
				paramsOf(c.req.url, none)
				const { client, sent } = clientOf(c)
				const body: unknown = c.req.valid('json')
				return sent(c.json(await answer(c.var.caller, client, body)))
			})
		}
	}
	return routed
}
