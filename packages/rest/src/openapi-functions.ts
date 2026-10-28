// The functions' part of the document (D-144): each one's route, its
// parameters or body, and its output, as GraphQL names their types.
import type { Node } from '@ultimabase/http/internal'
import { isNode, jsonSchemaOf } from '@ultimabase/http/internal'
import type { ExposedOutput, ExposedType } from 'ultimabase'
import type { Routed } from './functions.ts'
import { getParams } from './functions.ts'
import type { Doc } from './openapi-inputs.ts'
import { rowOf } from './openapi-models.ts'
import type { Schema } from './openapi.ts'
import {
	arrayOf,
	describe,
	failed,
	hoisted,
	json,
	objectOf,
	orNull,
} from './openapi.ts'

const upper = (name: string): string =>
	name.charAt(0).toUpperCase() + name.slice(1)

const prefix = '#/components/schemas/'

/** A schema, or the component it refers to. */
function resolve(doc: Doc, schema: Schema): Schema {
	const ref = schema['$ref']
	if (typeof ref !== 'string' || !ref.startsWith(prefix)) return schema
	return doc.components.schemas[ref.slice(prefix.length)] ?? {}
}

/** A `defineType`, each of its fields always given (D-109). */
function typeOf(doc: Doc, type: ExposedType, owner: string): Schema {
	return doc.components.ref(type.name, () =>
		describe(
			objectOf(
				Object.fromEntries(
					[...type.fields].map(([name, field]) => [
						name,
						outputOf(doc, field, owner, `${type.name}${upper(name)}`),
					]),
				),
				[...type.fields.keys()],
			),
			type.description,
		),
	)
}

/** A model, a `defineType` or a schema, held as `form` says (D-109). */
function outputOf(
	doc: Doc,
	output: ExposedOutput,
	owner: string,
	root: string,
): Schema {
	if (output.kind === 'schema') {
		const node = jsonSchemaOf(output.schema, 'output', `${owner}: output`)
		return hoisted(doc.components, node, 'output', owner, root)
	}
	const one =
		output.kind === 'model'
			? rowOf(doc, output.name)
			: typeOf(doc, output.type, owner)
	if (output.form === 'list') return arrayOf(one)
	return output.form === 'nullable' ? orNull(one) : one
}

/** A GET's parameters, as `getParams` reads them. */
function paramsOf(doc: Doc, input: Node, schema: Schema): readonly Schema[] {
	const { accepted, flat } = getParams(input)
	if (!flat) {
		const as = accepted.text.length > 0 ? { schema } : { content: json(schema) }
		return [{ name: 'input', in: 'query', required: true, ...as }]
	}
	const object = resolve(doc, schema)
	const properties = isNode(object['properties']) ? object['properties'] : {}
	const required = Array.isArray(object['required']) ? object['required'] : []
	return Object.entries(properties).map(([name, property]) => ({
		name,
		in: 'query',
		...(required.includes(name) && { required: true }),
		...(accepted.text.includes(name)
			? { schema: property }
			: { content: json(isNode(property) ? property : {}) }),
	}))
}

/** `/functions/{name}`, a query over GET, a mutation over POST (D-109). */
export function functionPaths(
	doc: Doc,
	functions: readonly Routed[],
): { [path: string]: Schema } {
	const paths: { [path: string]: Schema } = {}
	for (const { fn, owner, name, input } of functions) {
		const base = upper(name)
		const given =
			input === undefined
				? undefined
				: hoisted(doc.components, input, 'input', owner, `${base}Input`)
		const output =
			fn.output === undefined
				? { const: true }
				: outputOf(doc, fn.output, owner, `${base}Output`)
		const operation = {
			operationId: doc.components.operation(name, owner, 'name'),
			tags: ['functions'],
			...(fn.description !== undefined && { description: fn.description }),
			...(fn.query && given !== undefined && input !== undefined
				? { parameters: paramsOf(doc, input, given) }
				: {}),
			...(!fn.query &&
				given !== undefined && {
					requestBody: { required: true, content: json(given) },
				}),
			responses: {
				200: { description: `What ${name} returns.`, content: json(output) },
				...failed,
			},
		}
		paths[`/functions/${name}`] = fn.query
			? { get: operation }
			: { post: operation }
	}
	return paths
}
