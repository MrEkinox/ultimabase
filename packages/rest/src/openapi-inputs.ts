// The inputs of the document (D-144), named and typed as GraphQL's (D-129):
// each field's value, the unique target in REST's flat form, and the data a
// write takes.
import {
	backOf,
	declared,
	jsonSchemaOf,
	oneOfsOf,
} from '@ultimabase/http/internal'
import type { SchemaField } from 'ultimabase'
import { Refused } from 'ultimabase'
import { decimalPattern } from 'ultimabase/internal'
import type { Api, Entry } from './entries.ts'
import { entryOf } from './entries.ts'
import { oneOfInput } from './openapi-one-ofs.ts'
import type { Components, Schema } from './openapi.ts'
import {
	arrayOf,
	describe,
	described,
	hoisted,
	objectOf,
	oneKey,
	orNull,
} from './openapi.ts'

export type Scalar = Extract<SchemaField, { readonly kind: 'scalar' }>
type Relation = Exclude<SchemaField, Scalar>

/** What the document is built from: its components and REST's models. */
export type Doc = { readonly components: Components; readonly api: Api }

const upper = (name: string): string =>
	name.charAt(0).toUpperCase() + name.slice(1)

/** Whether a model has fields its `_search` matches (D-148). */
export const searched = (fields: readonly SchemaField[]): boolean =>
	fields.some((field) => field.kind === 'scalar' && field.search === true)

const id: Schema = { type: 'string' }
const dateTime: Schema = { type: 'string', format: 'date-time' }

/** One value of `field`, a list's item, by GraphQL's type name. */
export function item(
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
		case 'decimal':
			return {
				name: 'Decimal',
				schema: { type: 'string', pattern: decimalPattern },
			}
		case 'boolean':
			return { name: 'Boolean', schema: { type: 'boolean' } }
		case 'dateTime':
			return { name: 'DateTime', schema: dateTime }
		case 'date':
			return { name: 'Date', schema: { type: 'string', format: 'date' } }
		case 'enum': {
			const values = field.values ?? []
			const shared = entryOf(doc.api, model).exposed.enums[field.name]
			if (shared !== undefined) {
				const { name, description } = shared
				const schema = describe({ type: 'string', enum: values }, description)
				const owner = `${model}.${field.name}`
				return { name, schema: doc.components.shared(name, schema, owner) }
			}
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

/**
 * A json field's value: its validator's JSON Schema, any JSON without
 * (D-125); a plugin field's read value, its shape's (D-152).
 */
function jsonOf(
	doc: Doc,
	model: string,
	field: Scalar,
	side: 'input' | 'output',
): Schema {
	const { validators, fieldTypes } = entryOf(doc.api, model).exposed
	const validator = validators[field.name] ?? fieldTypes[field.name]?.shape
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

/** A field's value, a plugin field's as its shape says (D-122, D-152). */
export function valueOf(
	doc: Doc,
	entry: Entry,
	field: Scalar,
	side: 'input' | 'output',
): Schema {
	if (entry.exposed.fieldTypes[field.name] !== undefined) {
		// What it takes is the field type's own.
		return side === 'input' ? {} : jsonOf(doc, entry.model.name, field, side)
	}
	const { schema } = item(doc, entry.model.name, field, side)
	return field.list ? arrayOf(schema) : schema
}

/** A scalar field's output, `null` when it is optional or a rule hides it. */
export function scalarOf(doc: Doc, entry: Entry, field: Scalar): Schema {
	const ruled = entry.exposed.readRules[field.name] === 'rule'
	const value = valueOf(doc, entry, field, 'output')
	return ruled || (field.optional && !field.list) ? orNull(value) : value
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

/** The relation back from its target, as declared (D-138, D-247). */
const backOn = (doc: Doc, field: Relation): string | undefined =>
	backOf(field, entryOf(doc.api, field.target).model)

/** `WithoutPost`, or nothing for a `one` without a target's side (D-237). */
const facingOf = (back: string | undefined): string =>
	back === undefined ? '' : `Without${upper(back)}`

/** `PostCreateOrConnectWithoutCommentsInput`: a target found, or created. */
function orCreateOf(doc: Doc, field: Relation): Schema {
	const back = backOn(doc, field)
	return doc.components.ref(
		`${field.target}CreateOrConnect${facingOf(back)}Input`,
		() =>
			objectOf(
				{
					where: uniqueOf(doc, field.target),
					create: dataOf(doc, field.target, true, back),
				},
				['where', 'create'],
			),
	)
}

/**
 * A relation's write, as GraphQL names it (D-128, D-138): a hidden target is
 * connected, disconnected or set, never created, updated or deleted.
 */
function relationInput(doc: Doc, field: Relation, creating: boolean): Schema {
	const many = field.kind === 'many'
	const shape = many ? 'Many' : field.optional ? 'One' : 'OneRequired'
	// A `one` without a target's side takes the target's whole input (D-237).
	const back = backOn(doc, field)
	const facing = facingOf(back)
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
			fields['connectOrCreate'] = listed(orCreateOf(doc, field))
			fields['create'] = listed(dataOf(doc, field.target, true, back))
		}
		if (updating && shape !== 'OneRequired') {
			fields['delete'] = many ? listed(unique) : { type: 'boolean' }
		}
		if (!creating && shape !== 'OneRequired') {
			fields['disconnect'] = many ? listed(unique) : { type: 'boolean' }
		}
		// A filtered relation takes no `set` (D-151).
		if (!creating && many && field.filtered !== true) {
			fields['set'] = listed(unique)
		}
		if (updating) {
			const data = dataOf(doc, field.target, false, back)
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
	const name = `${model}${creating ? 'Create' : 'Update'}${facingOf(without)}Input`
	return doc.components.ref(name, () => {
		const entry = entryOf(doc.api, model)
		const fields: { [name: string]: Schema } = {}
		for (const field of entry.model.fields) {
			// A view is read-only (D-151, D-240); a `oneOf`'s kinds are written
			// through it (D-247).
			if (
				declared(field) === without ||
				(field.kind === 'one' && field.of !== undefined) ||
				((field.kind === 'many' || (field.kind === 'one' && !field.stored)) &&
					field.from !== undefined)
			)
				continue
			if (field.kind !== 'scalar') {
				fields[field.name] = relationInput(doc, field, creating)
				continue
			}
			const value = valueOf(doc, entry, field, 'input')
			fields[field.name] = field.optional && !field.list ? orNull(value) : value
		}
		const visible = (field: Relation) => entryOf(doc.api, field.target).visible
		for (const oneOf of oneOfsOf(entry.model)) {
			if (oneOf.name === without) continue
			fields[oneOf.name] = oneOfInput(doc, model, oneOf, creating, {
				connect: (field) => uniqueOf(doc, field.target),
				connectOrCreate: (field) =>
					visible(field) ? orCreateOf(doc, field) : undefined,
				create: (field) =>
					visible(field)
						? dataOf(doc, field.target, true, backOn(doc, field))
						: undefined,
			})
		}
		const required = creating
			? entry.exposed.required.filter((each) => each !== without)
			: []
		const { descriptions, deprecations } = entry.exposed
		return objectOf(described(fields, descriptions, deprecations), required)
	})
}
