// The application's functions (D-129): a query at `GET /api/functions/:name`,
// its input keys as query parameters, a mutation at `POST`, its body as its
// input, each answered with the output GraphQL's field returns.
import type { Routes } from '@ultimabase/http'
import { clientOf, validate } from '@ultimabase/http'
import type { Node } from '@ultimabase/http/internal'
import { isNode, jsonSchemaOf, rowOf } from '@ultimabase/http/internal'
import type { Caller, Client, ExposedFunction, ExposedOutput } from 'ultimabase'
import { Refused } from 'ultimabase'
import type { Api, Entry } from './entries.ts'
import { checkName, entryOf } from './entries.ts'
import { defaultShape, defaultVirtuals, shaped } from './fields.ts'
import { acceptsNull, isText, resolved } from './json-schema.ts'
import { anyBody } from './models.ts'
import type { Accepted } from './params.ts'
import { paramsOf } from './params.ts'

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

/** A value as GraphQL returns a function's output, a model's row its scalars. */
function outputOf(
	api: Api,
	output: ExposedOutput,
	value: unknown,
	where: string,
	pending: Pending,
): unknown {
	if (output.kind === 'schema') return value ?? null
	if (value === null || value === undefined) {
		if (output.form === 'nullable') return null
		throw nonNull(where)
	}
	if (output.form === 'list') {
		const items: readonly unknown[] = Array.isArray(value) ? value : []
		const item = { ...output, form: 'one' } as const
		return items.map((each) => outputOf(api, item, each, where, pending))
	}
	if (output.kind === 'model') {
		const row = rowOf(value)
		if (row === undefined) {
			throw new TypeError(`A ${output.name} was returned without its id.`)
		}
		const entry = entryOf(api, output.name)
		const copy = shaped(row, defaultShape(entry))
		if (defaultVirtuals(entry).length > 0) {
			pending.set(entry, [...(pending.get(entry) ?? []), { id: row.id, copy }])
		}
		return copy
	}
	const given: Node = isNode(value) ? value : {}
	const { type } = output
	return Object.fromEntries(
		[...type.fields].map(([name, field]) => [
			name,
			outputOf(api, field, given[name], `${type.name}.${name}`, pending),
		]),
	)
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
				: output?.form === 'nullable'
		const answer = async (as: Caller, client: Client, sent: unknown) => {
			const value = await fn.run(sent, { as }, client)
			if (output === undefined) return true
			if (value === undefined && !nullable) {
				throw new TypeError(
					`${fn.name} returned undefined; make its output .nullable() and return null.`,
				)
			}
			const pending: Pending = new Map()
			const answered = outputOf(api, output, value, fn.name, pending)
			await withVirtuals(pending, as)
			return answered
		}
		const path = `${base}/functions/${name}`
		if (fn.query) {
			const { accepted, flat } = getParams(root)
			app.get(path, async (c) => {
				const params = paramsOf(c.req.url, accepted)
				const { client, sent } = clientOf(c)
				const given = flat ? params : params['input']
				return sent(c.json(await answer(c.var.caller, client, given)))
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
