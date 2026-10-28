// The OpenAPI 3.1 document (D-144): REST's routes and their JSON, typed as
// GraphQL types them and named as it names them, seen as a caller other
// than Master. Built once, at startup.
import type { Node } from '@ultimabase/http/internal'
import { isNode } from '@ultimabase/http/internal'
import { Refused } from 'ultimabase'
import type { Api } from './entries.ts'
import type { Routed } from './functions.ts'
import { functionPaths } from './openapi-functions.ts'
import { modelPaths } from './openapi-models.ts'

export type Schema = Node

export const refTo = (name: string): Schema => ({
	$ref: `#/components/schemas/${name}`,
})

/** `schema` or `null`; any value already takes `null`. */
export const orNull = (schema: Schema): Schema =>
	Object.keys(schema).length === 0
		? schema
		: { anyOf: [schema, { type: 'null' }] }

export const arrayOf = (items: Schema): Schema => ({ type: 'array', items })

/** `schema` with its `description`, when it has one (D-150). */
export const describe = (
	schema: Schema,
	description: string | undefined,
): Schema => (description === undefined ? schema : { ...schema, description })

/** Each property with its field's `description` (D-150). */
export const described = (
	properties: { readonly [key: string]: Schema },
	descriptions: { readonly [field: string]: string },
): { readonly [key: string]: Schema } =>
	Object.fromEntries(
		Object.entries(properties).map(([key, schema]) => [
			key,
			describe(schema, descriptions[key]),
		]),
	)

/** An object of these properties, and no other. */
export const objectOf = (
	properties: { readonly [key: string]: Schema },
	required: readonly string[] = [],
): Schema => ({
	type: 'object',
	properties,
	...(required.length > 0 && { required }),
	additionalProperties: false,
})

/** A JSON value under `name`, as a parameter or a body holds it. */
export const json = (schema: Schema): Schema => ({
	'application/json': { schema },
})

/** The answer of each failed request (D-106). */
export const failed: Schema = {
	default: {
		description: 'The request failed.',
		content: json(refTo('Error')),
	},
}

const errorSchema: Schema = {
	type: 'object',
	properties: {
		code: { type: 'string' },
		message: { type: 'string' },
		details: {},
		correlationId: { type: 'string' },
	},
	required: ['code', 'message'],
}

type Known = { readonly owner: string; readonly key: string | undefined }

const rest = 'REST'

const clash = (owner: string, name: string): Refused =>
	new Refused(`${owner}: REST names a schema ${name}; give yours another name.`)

/** The document's named schemas, each name of one shape. */
export class Components {
	readonly schemas: { [name: string]: Schema } = {}
	readonly #known = new Map<string, Known>()
	readonly #operations = new Map<string, string>()

	/** The schema REST names `name`, built on its first use. */
	ref(name: string, build: () => Schema): Schema {
		const known = this.#known.get(name)
		if (known !== undefined && known.owner !== rest)
			throw clash(known.owner, name)
		if (known === undefined) {
			this.#known.set(name, { owner: rest, key: undefined })
			// Set first: a schema may refer to itself.
			this.schemas[name] = {}
			this.schemas[name] = build()
		}
		return refTo(name)
	}

	/** A schema a JSON Schema names, its id `name`. */
	shared(name: string, schema: Schema, owner: string): Schema {
		if (!/^[\w.-]+$/.test(name)) {
			throw new Refused(
				`${owner}: ${name} is not a schema name, which takes letters, digits, '.', '-' and '_'.`,
			)
		}
		// One shape whatever it says of itself: its first description stays.
		const { description: _, ...shape } = schema
		const key = JSON.stringify(shape)
		const known = this.#known.get(name)
		if (known?.owner === rest) throw clash(owner, name)
		if (known === undefined) {
			this.#known.set(name, { owner, key })
			this.schemas[name] = schema
		} else if (known.key !== key) {
			throw new Refused(
				`${known.owner} and ${owner} give the schema ${name} two shapes; name each once.`,
			)
		}
		return refTo(name)
	}

	/** An operation's id, which no other operation has. */
	operation(id: string, owner: string, setting: 'plural' | 'name'): string {
		const other = this.#operations.get(id)
		if (other !== undefined) {
			throw new Refused(
				`${owner}: the operation ${id} is ${other}'s; set .with({ rest: { ${setting} } }).`,
			)
		}
		this.#operations.set(id, owner)
		return id
	}
}

/**
 * A JSON Schema with its `$defs` among the components, named by their ids,
 * `Input`-suffixed on the input side as in GraphQL; `#` is `root`'s own.
 */
export function hoisted(
	components: Components,
	node: Node,
	side: 'input' | 'output',
	owner: string,
	root: string,
): Schema {
	const suffix = side === 'input' ? 'Input' : ''
	let recursive = false
	const rewrite = (value: unknown): unknown => {
		if (Array.isArray(value)) return value.map(rewrite)
		if (!isNode(value)) return value
		const ref = value['$ref']
		if (ref === '#') {
			recursive = true
			return { ...value, $ref: refTo(root)['$ref'] }
		}
		if (typeof ref === 'string' && ref.startsWith('#/$defs/')) {
			return { ...value, $ref: refTo(`${ref.slice(8)}${suffix}`)['$ref'] }
		}
		return Object.fromEntries(
			Object.entries(value).map(([key, inner]) => [key, rewrite(inner)]),
		)
	}
	const { $defs: defs, $schema: _, ...own } = node
	if (isNode(defs)) {
		for (const [id, def] of Object.entries(defs)) {
			const schema = rewrite(def)
			if (isNode(schema)) components.shared(`${id}${suffix}`, schema, owner)
		}
	}
	const schema = rewrite(own)
	const result = isNode(schema) ? schema : {}
	return recursive ? components.shared(root, result, owner) : result
}

/** The document `GET {path}/openapi.json` answers. */
export function openapiOf(
	api: Api,
	functions: readonly Routed[],
	base: string,
	version: string,
): Schema {
	const components = new Components()
	components.ref('Error', () => errorSchema)
	const doc = { components, api }
	const paths: { [path: string]: Schema } = {}
	for (const entry of api.entries.values()) {
		if (entry.visible) Object.assign(paths, modelPaths(doc, entry))
	}
	Object.assign(paths, functionPaths(doc, functions))
	return {
		openapi: '3.1.0',
		info: { title: 'UltimaBase REST API', version },
		servers: [{ url: base === '' ? '/' : base }],
		paths,
		components: { schemas: components.schemas },
	}
}
