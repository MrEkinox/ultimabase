// A model's routes in the document (D-144): `/posts` and `/posts/{id}`, their
// parameters, bodies and answers.
import { readable } from '@ultimabase/http/internal'
import type { Entry } from './entries.ts'
import { entryOf, system } from './entries.ts'
import { whereOf } from './openapi-filters.ts'
import type { Doc, Scalar } from './openapi-inputs.ts'
import { dataOf, scalarOf, uniqueOf } from './openapi-inputs.ts'
import {
	dates,
	fieldsOf,
	listOf,
	ordering,
	pageParams,
	param,
	rowOf,
} from './openapi-models.ts'
import type { Schema } from './openapi.ts'
import { described, failed, json, objectOf } from './openapi.ts'

const text: Schema = { type: 'string' }

/**
 * `DeletedPost`: a deleted row as it was, `id`, the dates and its scalar
 * fields, without its relations or its virtuals, as GraphQL's (D-107).
 */
function deletedOf(doc: Doc, model: string): Schema {
	return doc.components.ref(`Deleted${model}`, () => {
		const entry = entryOf(doc.api, model)
		const fields: { [name: string]: Schema } = { ...dates }
		const scalars = readable(entry).filter(
			(field): field is Scalar => field.kind === 'scalar',
		)
		for (const field of scalars)
			fields[field.name] = scalarOf(doc, entry, field)
		const { descriptions, deprecations } = entry.exposed
		const required = [...system, ...scalars.map(({ name }) => name)]
		return objectOf(described(fields, descriptions, deprecations), required)
	})
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
					...pageParams(doc, model),
				],
				responses: {
					200: answer(`The ${model} rows.`, listOf(doc, model)),
					...failed,
				},
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
					200: answer(`The ${model} as it was.`, deletedOf(doc, model)),
					...failed,
				},
			},
		},
	}
}
