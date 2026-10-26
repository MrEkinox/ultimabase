// The application's functions (D-129): a query at `GET /api/functions/:name`,
// its input keys as query parameters, a mutation at `POST`, its body as its
// input, each answered with the output GraphQL's field returns.
import type { Routes } from '@ultimabase/http'
import { clientOf, validate } from '@ultimabase/http'
import type { Caller, Client, ExposedFunction, ExposedOutput } from 'ultimabase'
import { Refused } from 'ultimabase'
import type { Api } from './entries.ts'
import { checkName, entryOf } from './entries.ts'
import { defaultShape, shaped } from './fields.ts'
import type { Node } from './json-schema.ts'
import {
	acceptsNull,
	isNode,
	isText,
	resolved,
	schemaOf,
} from './json-schema.ts'
import { anyBody } from './models.ts'
import type { Accepted } from './params.ts'
import { paramsOf } from './params.ts'
import { rowOf } from './pages.ts'

/** A function's key of `.with` (D-129): its route's name, or hidden. */
export type RestFunctionWith = { readonly name?: string } | false

const none: Accepted = { json: [], text: [] }

/**
 * A GET's parameters: an object input's keys, as GraphQL's arguments, or
 * one `input`; a string as is, any other value as JSON.
 */
function getParams(root: Node | undefined): {
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

const nonNull = (where: string): TypeError =>
	new TypeError(`Cannot return null for non-nullable field ${where}.`)

/** A value as GraphQL returns a function's output, a model's row its scalars. */
function outputOf(
	api: Api,
	output: ExposedOutput,
	value: unknown,
	where: string,
): unknown {
	if (output.kind === 'schema') return value ?? null
	if (value === null || value === undefined) {
		if (output.form === 'nullable') return null
		throw nonNull(where)
	}
	if (output.form === 'list') {
		const items: readonly unknown[] = Array.isArray(value) ? value : []
		const item = { ...output, form: 'one' } as const
		return items.map((each) => outputOf(api, item, each, where))
	}
	if (output.kind === 'model') {
		const row = rowOf(value)
		if (row === undefined) {
			throw new TypeError(`A ${output.name} was returned without its id.`)
		}
		return shaped(row, defaultShape(entryOf(api, output.name)))
	}
	const given: Node = isNode(value) ? value : {}
	const { type } = output
	return Object.fromEntries(
		[...type.fields].map(([name, field]) => [
			name,
			outputOf(api, field, given[name], `${type.name}.${name}`),
		]),
	)
}

/** Each routed function under `${base}/functions` (D-109, D-113). */
export function functionRoutes(
	app: Routes,
	api: Api,
	functions: readonly ExposedFunction<RestFunctionWith>[],
	base: string,
): void {
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
				: schemaOf(input, 'input', `${owner}: input`)
		const nullable =
			output?.kind === 'schema'
				? acceptsNull(schemaOf(output.schema, 'output', `${owner}: output`))
				: output?.form === 'nullable'
		const answer = async (as: Caller, client: Client, sent: unknown) => {
			const value = await fn.run(sent, { as }, client)
			if (output === undefined) return true
			if (value === undefined && !nullable) {
				throw new TypeError(
					`${fn.name} returned undefined; make its output .nullable() and return null.`,
				)
			}
			return outputOf(api, output, value, fn.name)
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
}
