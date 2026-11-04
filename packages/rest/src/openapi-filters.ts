// The filters of the document (D-144), named and typed as GraphQL's
// (D-129): each scalar type's operators, the relations' and `oneOf`s'
// filters, and `where`.
import { readable, readableOneOfs } from '@ultimabase/http/internal'
import type { SchemaField } from 'ultimabase'
import { entryOf } from './entries.ts'
import type { Doc, Scalar } from './openapi-inputs.ts'
import { item, searched } from './openapi-inputs.ts'
import { oneOfFilter } from './openapi-one-ofs.ts'
import type { Schema } from './openapi.ts'
import {
	arrayOf,
	described,
	objectOf,
	oneOrMore,
	orNull,
	refTo,
} from './openapi.ts'

type Relation = Exclude<SchemaField, Scalar>

const id: Schema = { type: 'string' }
const dateTime: Schema = { type: 'string', format: 'date-time' }

const base = ['equals', 'not', 'in', 'notIn']
const ordered = [...base, 'lt', 'lte', 'gt', 'gte']
const text = [...base, 'contains', 'startsWith', 'endsWith', 'mode']
const operators: { readonly [T in Scalar['type']]: readonly string[] } = {
	string: text,
	number: ordered,
	decimal: ordered,
	dateTime: ordered,
	date: ordered,
	boolean: base,
	// Any JSON, a path into it or not, typed field or not (D-149).
	json: [
		'path',
		...ordered,
		'stringContains',
		'stringStartsWith',
		'stringEndsWith',
		'mode',
		'arrayContains',
		'arrayStartsWith',
		'arrayEndsWith',
	],
	enum: base,
}

/** `StringFilter`, `PostStatusFilter`: `equals` and `not` take `null` too. */
function filter(
	doc: Doc,
	name: string,
	value: Schema,
	list: readonly string[],
): Schema {
	return doc.components.ref(`${name}Filter`, () =>
		objectOf(
			Object.fromEntries(
				list.map((operator) => {
					if (operator === 'mode') {
						const mode = doc.components.ref('QueryMode', () => ({
							type: 'string',
							enum: ['insensitive'],
						}))
						return [operator, mode]
					}
					if (operator === 'in' || operator === 'notIn') {
						return [operator, arrayOf(value)]
					}
					if (operator === 'path')
						return [operator, arrayOf({ type: 'string' })]
					if (operator.startsWith('string')) {
						return [operator, { type: 'string' }]
					}
					const nullable = operator === 'equals' || operator === 'not'
					return [operator, nullable ? orNull(value) : value]
				}),
			),
		),
	)
}

function scalarFilter(doc: Doc, model: string, field: Scalar): Schema {
	// A typed json field's operands are any JSON at a path (D-149).
	if (field.type === 'json' && !field.list) {
		return filter(doc, 'JSON', {}, operators.json)
	}
	const { name, schema } = item(doc, model, field, 'input')
	if (field.list) {
		return doc.components.ref(`${name}ListFilter`, () =>
			objectOf({
				has: schema,
				hasSome: arrayOf(schema),
				hasEvery: arrayOf(schema),
				isEmpty: { type: 'boolean' },
			}),
		)
	}
	return filter(doc, name, schema, operators[field.type])
}

/** Each filter of `PostWhereInput`, by its field. */
function filtersOf(doc: Doc, model: string): { [name: string]: Schema } {
	const entry = entryOf(doc.api, model)
	const dates = filter(doc, 'DateTime', dateTime, ordered)
	const fields: { [name: string]: Schema } = {
		id: filter(doc, 'ID', id, base),
		createdAt: dates,
		updatedAt: dates,
	}
	if (searched(readable(entry))) fields['_search'] = { type: 'string' }
	for (const field of readable(entry)) {
		// Only a beforeFind filters a plugin field (D-122).
		if (entry.exposed.fieldTypes[field.name] !== undefined) continue
		fields[field.name] =
			field.kind === 'scalar'
				? scalarFilter(doc, model, field)
				: field.kind === 'many' && field.exists
					? { type: 'boolean' }
					: relationFilter(doc, field)
	}
	// A `oneOf` by its kind, a kind, or the fields they share (D-247).
	for (const oneOf of readableOneOfs(entry)) {
		fields[oneOf.name] = oneOfFilter(
			doc,
			model,
			oneOf,
			(target) => filtersOf(doc, target),
			(field) => relationFilter(doc, field),
		)
	}
	return fields
}

/** `PostWhereInput`, its relation filters included. */
export function whereOf(doc: Doc, model: string): Schema {
	return doc.components.ref(`${model}WhereInput`, () => {
		const self = refTo(`${model}WhereInput`)
		const { deprecations } = entryOf(doc.api, model).exposed
		const fields = {
			AND: oneOrMore(self),
			OR: oneOrMore(self),
			NOT: oneOrMore(self),
			...filtersOf(doc, model),
		}
		return objectOf(described(fields, {}, deprecations))
	})
}

function relationFilter(doc: Doc, field: Relation): Schema {
	const one = field.kind === 'one'
	const name = `${field.target}${one ? 'Relation' : 'ListRelation'}Filter`
	return doc.components.ref(name, () => {
		const where = whereOf(doc, field.target)
		const keys = one ? ['is', 'isNot'] : ['some', 'every', 'none']
		const filters = Object.fromEntries(
			keys.map((key): [string, Schema] => [key, where]),
		)
		// The caller's user, read by the kernel (D-189).
		if (entryOf(doc.api, field.target).exposed.user) {
			filters['viewer'] = { type: 'boolean' }
		}
		return objectOf(filters)
	})
}
