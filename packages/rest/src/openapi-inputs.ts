// The inputs of the document (D-144), named and typed as GraphQL's (D-129):
// each field's value, the filters, `where`, `orderBy`, the unique target
// in REST's flat form, and the data a write takes.
import { jsonSchemaOf, readable } from '@ultimabase/http/internal'
import type { SchemaField } from 'ultimabase'
import { Refused } from 'ultimabase'
import type { Api, Entry } from './entries.ts'
import { entryOf } from './entries.ts'
import type { Components, Schema } from './openapi.ts'
import { arrayOf, hoisted, objectOf, orNull, refTo } from './openapi.ts'

type Scalar = Extract<SchemaField, { readonly kind: 'scalar' }>
type Relation = Exclude<SchemaField, Scalar>

/** What the document is built from: its components and REST's models. */
export type Doc = { readonly components: Components; readonly api: Api }

const upper = (name: string): string =>
	name.charAt(0).toUpperCase() + name.slice(1)

const id: Schema = { type: 'string' }
const dateTime: Schema = { type: 'string', format: 'date-time' }

/** One value of `field`, a list's item, by GraphQL's type name. */
function item(
	doc: Doc,
	model: string,
	field: Scalar,
	side: 'input' | 'output',
): { readonly name: string; readonly schema: Schema } {
	const named = `${model}${upper(field.name)}`
	switch (field.type) {
		case 'string':
			return { name: 'String', schema: { type: 'string' } }
		case 'number':
			return field.integer === true
				? { name: 'Int', schema: { type: 'integer', format: 'int32' } }
				: { name: 'Float', schema: { type: 'number' } }
		case 'boolean':
			return { name: 'Boolean', schema: { type: 'boolean' } }
		case 'date':
			return { name: 'DateTime', schema: dateTime }
		case 'enum': {
			const values = field.values ?? []
			const schema = doc.components.ref(named, () => ({
				type: 'string',
				enum: values,
			}))
			return { name: named, schema }
		}
		case 'json':
			break
	}
	return { name: 'JSON', schema: jsonOf(doc, model, field, side) }
}

/** A json field's value: its validator's JSON Schema, any JSON without (D-125). */
function jsonOf(
	doc: Doc,
	model: string,
	field: Scalar,
	side: 'input' | 'output',
): Schema {
	const validator = entryOf(doc.api, model).exposed.validators[field.name]
	if (validator === undefined) return {}
	const owner = `${model}.${field.name}`
	let node
	try {
		node = jsonSchemaOf(validator, side, owner)
	} catch (error) {
		// As GraphQL types it: `JSON` without an export.
		if (error instanceof Refused) return {}
		throw error
	}
	const root = `${model}${upper(field.name)}${side === 'input' ? 'Input' : ''}`
	return hoisted(doc.components, node, side, owner, root)
}

/** A field's value, a plugin field's any JSON (D-122). */
export function valueOf(
	doc: Doc,
	entry: Entry,
	field: Scalar,
	side: 'input' | 'output',
): Schema {
	if (entry.exposed.fieldTypes[field.name] !== undefined) return {}
	const { schema } = item(doc, entry.model.name, field, side)
	return field.list ? arrayOf(schema) : schema
}

const base = ['equals', 'not', 'in', 'notIn']
const ordered = [...base, 'lt', 'lte', 'gt', 'gte']
const text = [...base, 'contains', 'startsWith', 'endsWith', 'mode']
const operators: { readonly [T in Scalar['type']]: readonly string[] } = {
	string: text,
	number: ordered,
	date: ordered,
	boolean: base,
	json: base,
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
					const nullable = operator === 'equals' || operator === 'not'
					return [operator, nullable ? orNull(value) : value]
				}),
			),
		),
	)
}

function scalarFilter(doc: Doc, model: string, field: Scalar): Schema {
	const { name, schema } = item(doc, model, field, 'input')
	if (field.list) {
		return doc.components.ref(`${name}ListFilter`, () =>
			objectOf({ has: schema, hasSome: arrayOf(schema) }),
		)
	}
	// A typed json field has a filter of its own, as in GraphQL (D-125).
	const typed = field.type === 'json' && Object.keys(schema).length > 0
	const named = typed ? `${model}${upper(field.name)}` : name
	return filter(doc, named, schema, operators[field.type])
}

/** One value or a list: GraphQL takes either for a list argument. */
const oneOrMore = (schema: Schema): Schema => ({
	anyOf: [schema, arrayOf(schema)],
})

/** `PostWhereInput`, its relation filters included. */
export function whereOf(doc: Doc, model: string): Schema {
	return doc.components.ref(`${model}WhereInput`, () => {
		const self = refTo(`${model}WhereInput`)
		const entry = entryOf(doc.api, model)
		const dates = filter(doc, 'DateTime', dateTime, ordered)
		const fields: { [name: string]: Schema } = {
			AND: oneOrMore(self),
			OR: oneOrMore(self),
			NOT: oneOrMore(self),
			id: filter(doc, 'ID', id, base),
			createdAt: dates,
			updatedAt: dates,
		}
		for (const field of readable(entry)) {
			// Only a beforeFind filters a plugin field (D-122).
			if (entry.exposed.fieldTypes[field.name] !== undefined) continue
			fields[field.name] =
				field.kind === 'scalar'
					? scalarFilter(doc, model, field)
					: relationFilter(doc, field)
		}
		return objectOf(fields)
	})
}

function relationFilter(doc: Doc, field: Relation): Schema {
	const one = field.kind === 'one'
	const name = `${field.target}${one ? 'Relation' : 'ListRelation'}Filter`
	return doc.components.ref(name, () => {
		const where = whereOf(doc, field.target)
		const keys = one ? ['is', 'isNot'] : ['some', 'every', 'none']
		return objectOf(Object.fromEntries(keys.map((key) => [key, where])))
	})
}

/** `PostOrderByInput`, an object or a list of them (D-94, D-134). */
export function orderByOf(doc: Doc, model: string): Schema {
	return doc.components.ref(`${model}OrderByInput`, () => {
		const order = doc.components.ref('SortOrder', () => ({
			type: 'string',
			enum: ['asc', 'desc'],
		}))
		const entry = entryOf(doc.api, model)
		const fields: { [name: string]: Schema } = {
			id: order,
			createdAt: order,
			updatedAt: order,
		}
		for (const field of readable(entry)) {
			if (field.kind === 'one')
				fields[field.name] = orderByOf(doc, field.target)
			else if (field.kind === 'many') {
				fields[field.name] = doc.components.ref('CountOrderByInput', () =>
					objectOf({ _count: order }),
				)
			} else if (
				field.type !== 'json' &&
				!field.list &&
				entry.exposed.fieldTypes[field.name] === undefined
			) {
				fields[field.name] = order
			}
		}
		return objectOf(fields)
	})
}

/**
 * `PostWhereUniqueInput`, as REST takes it: the fields of one unique set,
 * `{ id }` or `{ author, slug }`, a relation by its target's id.
 */
export function uniqueOf(doc: Doc, model: string): Schema {
	return doc.components.ref(`${model}WhereUniqueInput`, () => {
		const entry = entryOf(doc.api, model)
		const { readRules, uniques } = entry.exposed
		// A field only Master reads is absent, as from the filters (D-44).
		const sets = uniques.filter((unique) =>
			unique.every((name) => readRules[name] !== 'private'),
		)
		const typeOf = (name: string): Schema => {
			const field = entry.model.fields.find((each) => each.name === name)
			return field?.kind === 'scalar' ? valueOf(doc, entry, field, 'input') : id
		}
		return {
			anyOf: sets.map((unique) =>
				objectOf(
					Object.fromEntries(unique.map((name) => [name, typeOf(name)])),
					unique,
				),
			),
		}
	})
}

/** Exactly one of an object's keys, as a GraphQL `@oneOf` input. */
const oneKey = (schema: Schema): Schema => ({
	...schema,
	minProperties: 1,
	maxProperties: 1,
})

/**
 * A relation's write, as GraphQL names it (D-128, D-138): a hidden target is
 * connected, disconnected or set, never created, updated or deleted.
 */
function relationInput(doc: Doc, field: Relation, creating: boolean): Schema {
	const many = field.kind === 'many'
	const shape = many ? 'Many' : field.optional ? 'One' : 'OneRequired'
	const facing = `Without${upper(field.inverse)}`
	const name = creating
		? `${field.target}CreateNested${many ? 'Many' : 'One'}${facing}Input`
		: `${field.target}Update${shape}${facing}NestedInput`
	return doc.components.ref(name, () => {
		const listed = (schema: Schema) => (many ? arrayOf(schema) : schema)
		const unique = uniqueOf(doc, field.target)
		const { visible } = entryOf(doc.api, field.target)
		const updating = !creating && visible
		const fields: { [key: string]: Schema } = { connect: listed(unique) }
		if (visible) {
			const created = dataOf(doc, field.target, true, field.inverse)
			const orCreate = doc.components.ref(
				`${field.target}CreateOrConnect${facing}Input`,
				() => objectOf({ where: unique, create: created }, ['where', 'create']),
			)
			fields['connectOrCreate'] = listed(orCreate)
			fields['create'] = listed(created)
		}
		if (updating && shape !== 'OneRequired') {
			fields['delete'] = many ? listed(unique) : { type: 'boolean' }
		}
		if (!creating && shape !== 'OneRequired') {
			fields['disconnect'] = many ? listed(unique) : { type: 'boolean' }
		}
		if (!creating && many) fields['set'] = listed(unique)
		if (updating) {
			const data = dataOf(doc, field.target, false, field.inverse)
			fields['update'] = many
				? listed(
						doc.components.ref(
							`${field.target}UpdateWithWhereUnique${facing}Input`,
							() => objectOf({ where: unique, data }, ['where', 'data']),
						),
					)
				: data
		}
		return many ? objectOf(fields) : oneKey(objectOf(fields))
	})
}

/**
 * `PostCreateInput` and `PostUpdateInput`: every field, those only Master
 * reads included; a create needs the fields `create` needs (D-53). Through
 * a relation, `CommentCreateWithoutPostInput`, without it (D-138).
 */
export function dataOf(
	doc: Doc,
	model: string,
	creating: boolean,
	without?: string,
): Schema {
	const facing = without === undefined ? '' : `Without${upper(without)}`
	const name = `${model}${creating ? 'Create' : 'Update'}${facing}Input`
	return doc.components.ref(name, () => {
		const entry = entryOf(doc.api, model)
		const fields: { [name: string]: Schema } = {}
		for (const field of entry.model.fields) {
			if (field.name === without) continue
			if (field.kind !== 'scalar') {
				fields[field.name] = relationInput(doc, field, creating)
				continue
			}
			const value = valueOf(doc, entry, field, 'input')
			fields[field.name] = field.optional && !field.list ? orNull(value) : value
		}
		const required = creating
			? entry.exposed.required.filter((each) => each !== without)
			: []
		return objectOf(fields, required)
	})
}
