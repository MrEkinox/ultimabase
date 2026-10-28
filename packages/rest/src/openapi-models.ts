// A model's part of the document (D-144): its row, as GraphQL's type, its
// pages, its `select` and `include`, and its six routes.
import { readable } from '@ultimabase/http/internal'
import type { Entry } from './entries.ts'
import { entryOf, system } from './entries.ts'
import type { Doc } from './openapi-inputs.ts'
import {
	dataOf,
	orderByOf,
	uniqueOf,
	valueOf,
	whereOf,
} from './openapi-inputs.ts'
import type { Schema } from './openapi.ts'
import {
	arrayOf,
	describe,
	described,
	failed,
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

/**
 * `Post`: its default fields, which a row always holds without `select`,
 * and its relations, which `include` adds. A field with a read rule may be
 * `null`, a `one` relation always may (D-44).
 */
export function rowOf(doc: Doc, model: string): Schema {
	return doc.components.ref(model, () => {
		const entry = entryOf(doc.api, model)
		const date: Schema = { type: 'string', format: 'date-time' }
		const fields: { [name: string]: Schema } = {
			id: text,
			createdAt: date,
			updatedAt: date,
		}
		const required = [...system]
		for (const field of readable(entry)) {
			const ruled = entry.exposed.readRules[field.name] === 'rule'
			if (field.kind === 'scalar') {
				const value = valueOf(doc, entry, field, 'output')
				const empty = ruled || (field.optional && !field.list)
				fields[field.name] = empty ? orNull(value) : value
				required.push(field.name)
			} else if (field.kind === 'one') {
				fields[field.name] = orNull(rowOf(doc, field.target))
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
		const { description, descriptions } = entry.exposed
		return describe(
			objectOf(described(fields, descriptions), required),
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
function fieldsOf(doc: Doc, model: string, select: boolean): Schema {
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
			const args =
				field.kind === 'one'
					? argsOf(doc, field.target)
					: listArgsOf(doc, field.target)
			fields[field.name] = { anyOf: [flag, args] }
		}
		return objectOf(fields)
	})
}

const either: Schema = { not: { required: ['select', 'include'] } }

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

const ordering = (doc: Doc, model: string): Schema => {
	const order = orderByOf(doc, model)
	return { anyOf: [order, arrayOf(order)] }
}

/** A query parameter: JSON, or a string or a number as is. */
const param = (name: string, schema: Schema, description?: string): Schema => {
	const plain = schema['type'] === 'string' || schema['type'] === 'integer'
	return {
		name,
		in: 'query',
		...(description !== undefined && { description }),
		...(plain || schema === flag ? { schema } : { content: json(schema) }),
	}
}

function fieldParams(doc: Doc, model: string): readonly Schema[] {
	return [
		param(
			'select',
			fieldsOf(doc, model, true),
			'The fields to return, and only those; not with include.',
		),
		param(
			'include',
			fieldsOf(doc, model, false),
			'The relations to add to the default fields.',
		),
	]
}

const answer = (description: string, schema: Schema): Schema => ({
	description,
	content: json(schema),
})

const body = (schema: Schema): Schema => ({
	required: true,
	content: json(schema),
})

/** `/posts` and `/posts/{id}`, as REST serves them (D-129, D-142). */
export function modelPaths(doc: Doc, entry: Entry): { [path: string]: Schema } {
	const { components } = doc
	const model = entry.model.name
	const own = (id: string) => components.operation(id, model, 'plural')
	const tags = [model]
	const row = rowOf(doc, model)
	const counts = doc.api.pagination === 'connection'
	const list = counts
		? connectionOf(doc, `${model}Connection`, model)
		: arrayOf(row)
	const pages = Object.entries(pageOf(doc, entry)).map(([name, schema]) =>
		param(name, schema),
	)
	const one = model.charAt(0).toLowerCase() + model.slice(1)
	const id = {
		name: 'id',
		in: 'path',
		required: true,
		schema: text,
	}
	return {
		[`/${entry.plural}`]: {
			get: {
				operationId: own(entry.plural),
				tags,
				parameters: [
					param('where', whereOf(doc, model)),
					param('orderBy', ordering(doc, model)),
					...fieldParams(doc, model),
					...pages,
					...(counts ? [param('totalCount', flag)] : []),
				],
				responses: { 200: answer(`The ${model} rows.`, list), ...failed },
			},
			post: {
				operationId: own(`create${model}`),
				tags,
				parameters: fieldParams(doc, model),
				requestBody: body(dataOf(doc, model, true)),
				responses: { 201: answer(`The ${model} created.`, row), ...failed },
			},
			put: {
				operationId: own(`upsert${model}`),
				tags,
				description: `Updates the ${model} where matches, or creates it.`,
				parameters: fieldParams(doc, model),
				requestBody: body(
					objectOf(
						{
							where: uniqueOf(doc, model),
							create: dataOf(doc, model, true),
							update: dataOf(doc, model, false),
						},
						['where', 'create', 'update'],
					),
				),
				responses: {
					200: answer(`The ${model} updated.`, row),
					201: answer(`The ${model} created.`, row),
					...failed,
				},
			},
		},
		[`/${entry.plural}/{id}`]: {
			parameters: [id],
			get: {
				operationId: own(one),
				tags,
				parameters: fieldParams(doc, model),
				responses: { 200: answer(`The ${model}.`, row), ...failed },
			},
			patch: {
				operationId: own(`update${model}`),
				tags,
				parameters: fieldParams(doc, model),
				requestBody: body(dataOf(doc, model, false)),
				responses: { 200: answer(`The ${model} updated.`, row), ...failed },
			},
			delete: {
				operationId: own(`delete${model}`),
				tags,
				responses: {
					200: answer(`The ${model} as it was, without relations.`, row),
					...failed,
				},
			},
		},
	}
}
