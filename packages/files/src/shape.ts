// A file field's shape (D-152): the JSON Schema of what clients read, which
// REST and GraphQL type it with. It validates nothing: the plugin made the
// value.
import type { StandardSchema } from './standard.ts'
import type { FileOptions } from './field.ts'

type Node = { readonly [key: string]: unknown }
type Exported = {
	readonly jsonSchema: {
		readonly input: () => Node
		readonly output: () => Node
	}
}

const isNode = (value: unknown): value is Node =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const string = { type: 'string' }
const size = { type: 'integer', minimum: 0 }
const nullable = (node: Node): Node =>
	Object.keys(node).length === 0 ? node : { anyOf: [node, { type: 'null' }] }

const closed = (properties: { readonly [key: string]: Node }): Node => ({
	type: 'object',
	properties,
	required: Object.keys(properties),
	additionalProperties: false,
})

/** An inline value's JSON Schema, from its schema's; any JSON without one. */
function inlineOf(inline: unknown): Node {
	if (!isNode(inline) || !isNode(inline['schema'])) return {}
	const standard = inline['schema']['~standard']
	const exporter = isNode(standard) ? standard['jsonSchema'] : undefined
	const output = isNode(exporter) ? exporter['output'] : undefined
	if (typeof output !== 'function') return {}
	const node: unknown = Reflect.apply(output, exporter, [
		{ target: 'draft-2020-12' },
	])
	if (!isNode(node)) return {}
	const { $schema: _, ...rest } = node
	return rest
}

function fileNode(options: FileOptions): Node {
	const inline = Object.entries(options.inline ?? {}).map(
		([key, given]) => [key, nullable(inlineOf(given))] as const,
	)
	const variant = closed({ type: string, size, url: string })
	const variants = Object.keys(options.variants ?? {}).map(
		(key) => [key, nullable(variant)] as const,
	)
	return closed({
		id: string,
		name: string,
		type: string,
		size,
		url: string,
		inline: closed(Object.fromEntries(inline)),
		variants: closed(Object.fromEntries(variants)),
	})
}

function nodeOf(options: FileOptions): Node {
	const node = fileNode(options)
	if (options.list === true) return { type: 'array', items: node }
	return options.optional === true ? nullable(node) : node
}

/** What a field with `options` gives clients, as a Standard Schema. */
export const shapeOf = (
	options: FileOptions,
): StandardSchema & { readonly '~standard': Exported } => ({
	'~standard': {
		version: 1,
		vendor: 'ultimabase-files',
		validate: (value) => ({ value }),
		jsonSchema: {
			input: () => nodeOf(options),
			output: () => nodeOf(options),
		},
	},
})
