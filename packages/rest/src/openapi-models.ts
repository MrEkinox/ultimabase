// A model's part of the document (D-144): its row, as GraphQL's type, its
// pages, and its `select` and `include`.
import {
	isNode,
	jsonSchemaOf,
	readable,
	readableOneOfs,
	readableVirtuals,
} from '@ultimabase/http/internal'
import type { ExposedVirtual } from 'ultimabase'
import type { Entry } from './entries.ts'
import { entryOf, system } from './entries.ts'
import { whereOf } from './openapi-filters.ts'
import type { Doc } from './openapi-inputs.ts'
import { scalarOf } from './openapi-inputs.ts'
import { oneOfArgs, oneOfRow } from './openapi-one-ofs.ts'
import { orderByOf } from './openapi-order.ts'
import { outputOf } from './openapi-functions.ts'
import type { Schema } from './openapi.ts'
import {
	arrayOf,
	describe,
	described,
	hoisted,
	json,
	objectOf,
	orNull,
} from './openapi.ts'

const upper = (name: string): string =>
	name.charAt(0).toUpperCase() + name.slice(1)

const text: Schema = { type: 'string' }
const flag: Schema = { type: 'boolean' }

/** `PageInfo`, `PostEdge` and a connection of its edges. */
function connectionOf(doc: Doc, name: string, target: string): Schema {
	const { components } = doc
	return components.ref(name, () => {
		const pageInfo = components.ref('PageInfo', () =>
			objectOf(
				{
					hasNextPage: flag,
					hasPreviousPage: flag,
					startCursor: orNull(text),
					endCursor: orNull(text),
				},
				['hasNextPage', 'hasPreviousPage', 'startCursor', 'endCursor'],
			),
		)
		const edge = components.ref(`${target}Edge`, () =>
			objectOf({ cursor: text, node: rowOf(doc, target) }, ['cursor', 'node']),
		)
		return objectOf(
			{
				edges: arrayOf(edge),
				pageInfo,
				totalCount: { type: 'integer', minimum: 0 },
			},
			['edges', 'pageInfo'],
		)
	})
}

const date: Schema = { type: 'string', format: 'date-time' }
export const dates: { readonly [field: string]: Schema } = {
	id: text,
	createdAt: date,
	updatedAt: date,
}

/**
 * `Post`: its default fields, which a row always holds without `select`,
 * and its relations, which `include` adds. A field with a read rule may be
 * `null`, a `one` relation always may (D-44).
 */
export function rowOf(doc: Doc, model: string): Schema {
	return doc.components.ref(model, () => {
		const entry = entryOf(doc.api, model)
		const fields: { [name: string]: Schema } = { ...dates }
		const required = [...system]
		for (const field of readable(entry)) {
			const ruled = entry.exposed.readRules[field.name] === 'rule'
			if (field.kind === 'scalar') {
				fields[field.name] = scalarOf(doc, entry, field)
				required.push(field.name)
			} else if (field.kind === 'one') {
				fields[field.name] = orNull(rowOf(doc, field.target))
			} else if (field.exists) {
				// Whether its view keeps a row (D-246).
				fields[field.name] = ruled ? orNull(flag) : flag
			} else {
				const many =
					doc.api.pagination === 'connection'
						? connectionOf(
								doc,
								`${model}${upper(field.name)}Connection`,
								field.target,
							)
						: arrayOf(rowOf(doc, field.target))
				fields[field.name] = ruled ? orNull(many) : many
			}
		}
		// A `oneOf`, its kind and that kind's row (D-247).
		for (const oneOf of readableOneOfs(entry)) {
			const ruled = entry.exposed.readRules[oneOf.name] === 'rule'
			const value = oneOfRow(doc, model, oneOf, (target) => rowOf(doc, target))
			fields[oneOf.name] = ruled || oneOf.optional ? orNull(value) : value
		}
		// A virtual, computed: in the default row without an input (D-151).
		for (const virtual of readableVirtuals(entry)) {
			const { name } = virtual
			const owner = `${model}.${name}`
			const value = {
				...outputOf(doc, virtual.output, owner, `${model}${upper(name)}Output`),
				readOnly: true,
			}
			const ruled = entry.exposed.readRules[name] === 'rule'
			fields[name] = describe(
				ruled ? orNull(value) : value,
				virtual.description,
				virtual.deprecated,
			)
			if (virtual.default) required.push(name)
		}
		const { description, descriptions, deprecations } = entry.exposed
		return describe(
			objectOf(described(fields, descriptions, deprecations), required),
			description,
		)
	})
}

/** A list's page arguments, within the model's `maxTake`. */
function pageOf(doc: Doc, entry: Entry): { [name: string]: Schema } {
	const rows: Schema = { type: 'integer', minimum: 0, maximum: entry.maxTake }
	return doc.api.pagination === 'list'
		? { take: rows, skip: { type: 'integer', minimum: 0 } }
		: { first: rows, after: text, last: rows, before: text }
}

/** `PostSelect`, `PostInclude`, a relation's arguments (D-129). */
export function fieldsOf(doc: Doc, model: string, select: boolean): Schema {
	const name = `${model}${select ? 'Select' : 'Include'}`
	return doc.components.ref(name, () => {
		const entry = entryOf(doc.api, model)
		const fields: { [name: string]: Schema } = {}
		if (select) for (const key of system) fields[key] = flag
		for (const field of readable(entry)) {
			if (field.kind === 'scalar') {
				if (select) fields[field.name] = flag
				continue
			}
			const args = field.kind === 'one' ? argsOf : listArgsOf
			// An exists takes `true` and no arguments (D-246).
			fields[field.name] =
				field.kind === 'many' && field.exists
					? flag
					: { anyOf: [flag, args(doc, field.target)] }
		}
		for (const oneOf of readableOneOfs(entry)) {
			fields[oneOf.name] = oneOfArgs(doc, model, oneOf, (target) =>
				argsOf(doc, target),
			)
		}
		for (const virtual of readableVirtuals(entry)) {
			fields[virtual.name] = virtualArgsOf(doc, model, virtual)
		}
		return objectOf(fields)
	})
}

const either: Schema = { not: { required: ['select', 'include'] } }

/**
 * A virtual in `select` and `include` (D-151): `true` unless its input
 * needs a property, its input, and a model's `select` or `include`.
 */
function virtualArgsOf(
	doc: Doc,
	model: string,
	virtual: ExposedVirtual,
): Schema {
	const { name, input, output } = virtual
	const owner = `${model}.${name}`
	const base = `${model}${upper(name)}`
	const node =
		input === undefined
			? undefined
			: hoisted(
					doc.components,
					jsonSchemaOf(input, 'input', `${owner}: input`),
					'input',
					owner,
					`${base}Input`,
				)
	const listed: unknown = node?.['required']
	const required = Array.isArray(listed)
		? listed.filter((key): key is string => typeof key === 'string')
		: []
	const needed = required.length > 0
	const or = (schema: Schema) => (needed ? schema : { anyOf: [flag, schema] })
	if (output.kind !== 'model') return node === undefined ? flag : or(node)
	const properties = node?.['properties']
	return or(
		doc.components.ref(`${base}Args`, () => ({
			...objectOf(
				{
					...(isNode(properties) ? properties : {}),
					select: fieldsOf(doc, output.name, true),
					include: fieldsOf(doc, output.name, false),
				},
				required,
			),
			...either,
		})),
	)
}

/** `PostArgs`: a `one` relation's `select` or `include`. */
function argsOf(doc: Doc, model: string): Schema {
	return doc.components.ref(`${model}Args`, () => ({
		...objectOf({
			select: fieldsOf(doc, model, true),
			include: fieldsOf(doc, model, false),
		}),
		...either,
	}))
}

/** `PostListArgs`: a `many` relation's, its page and filter too. */
function listArgsOf(doc: Doc, model: string): Schema {
	return doc.components.ref(`${model}ListArgs`, () => {
		const entry = entryOf(doc.api, model)
		const counts = doc.api.pagination === 'connection'
		return {
			...objectOf({
				select: fieldsOf(doc, model, true),
				include: fieldsOf(doc, model, false),
				where: whereOf(doc, model),
				orderBy: ordering(doc, model),
				...pageOf(doc, entry),
				...(counts && { totalCount: flag }),
			}),
			...either,
		}
	})
}

export const ordering = (doc: Doc, model: string): Schema => {
	const order = orderByOf(doc, model)
	return { anyOf: [order, arrayOf(order)] }
}

/** A query parameter: JSON, or a string or a number as is. */
export const param = (
	name: string,
	schema: Schema,
	description?: string,
): Schema => {
	const plain = schema['type'] === 'string' || schema['type'] === 'integer'
	return {
		name,
		in: 'query',
		...(description !== undefined && { description }),
		...(plain || schema === flag ? { schema } : { content: json(schema) }),
	}
}

/** A model's list: its connection, or its rows with `pagination: 'list'`. */
export const listOf = (doc: Doc, model: string): Schema =>
	doc.api.pagination === 'connection'
		? connectionOf(doc, `${model}Connection`, model)
		: arrayOf(rowOf(doc, model))

/** A page's parameters: flat at the root, or one object at `path` (D-182). */
export function pageParams(
	doc: Doc,
	model: string,
	path = '',
): readonly Schema[] {
	const counts = doc.api.pagination === 'connection'
	const args = {
		...pageOf(doc, entryOf(doc.api, model)),
		...(counts && { totalCount: flag }),
	}
	if (path !== '') return [param(path, objectOf(args))]
	return Object.entries(args).map(([name, schema]) => param(name, schema))
}
