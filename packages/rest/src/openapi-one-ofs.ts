// A `oneOf` in the document (D-247), as GraphQL types it: an object of its
// kind and each kind's row, its filter by kind, by a kind and by the fields
// the kinds share, and its writes of one kind.
import type { ServedOneOf } from '@ultimabase/http/internal'
import type { Doc } from './openapi-inputs.ts'
import type { Schema } from './openapi.ts'
import { objectOf, oneKey, oneOrMore, orNull, refTo } from './openapi.ts'

type One = ServedOneOf['kinds'][number]['field']

const upper = (name: string): string =>
	name.charAt(0).toUpperCase() + name.slice(1)

const flag: Schema = { type: 'boolean' }

/** `CommentTarget` for `Comment.target`. */
const named = (model: string, oneOf: ServedOneOf): string =>
	`${model}${upper(oneOf.name)}`

/** `CommentTargetKind`: the kinds, each by its name. */
const kindOf = (doc: Doc, model: string, oneOf: ServedOneOf): Schema =>
	doc.components.ref(`${named(model, oneOf)}Kind`, () => ({
		type: 'string',
		enum: oneOf.kinds.map(({ kind }) => kind),
	}))

/** Each kind's schema, by its name. */
const each = (
	oneOf: ServedOneOf,
	of: (field: One) => Schema | undefined,
): { [kind: string]: Schema } => {
	const kinds: { [kind: string]: Schema } = {}
	for (const { kind, field } of oneOf.kinds) {
		const schema = of(field)
		if (schema !== undefined) kinds[kind] = schema
	}
	return kinds
}

/**
 * `CommentTarget`: its kind, and each kind's row a read asks for, `null` but
 * the row's own kind.
 */
export const oneOfRow = (
	doc: Doc,
	model: string,
	oneOf: ServedOneOf,
	row: (model: string) => Schema,
): Schema =>
	doc.components.ref(named(model, oneOf), () =>
		objectOf(
			{
				kind: kindOf(doc, model, oneOf),
				...each(oneOf, (field) => orNull(row(field.target))),
			},
			['kind'],
		),
	)

/** A `oneOf` in `select` and `include`: `true`, or its kinds, each a `one`'s. */
export const oneOfArgs = (
	doc: Doc,
	model: string,
	oneOf: ServedOneOf,
	args: (model: string) => Schema,
): Schema => ({
	anyOf: [
		flag,
		doc.components.ref(`${named(model, oneOf)}Args`, () =>
			objectOf(each(oneOf, (field) => ({ anyOf: [flag, args(field.target)] }))),
		),
	],
})

/**
 * `CommentTargetFilter`: `is` and `isNot` on the fields every kind filters
 * alike, `kind`, and each kind as a `one` relation's filter.
 */
export function oneOfFilter(
	doc: Doc,
	model: string,
	oneOf: ServedOneOf,
	filters: (model: string) => { readonly [field: string]: Schema },
	relation: (field: One) => Schema,
): Schema {
	const name = named(model, oneOf)
	const shared = `${name}SharedWhereInput`
	return doc.components.ref(`${name}Filter`, () => {
		const where = doc.components.ref(shared, () => {
			const self = refTo(shared)
			const fields: { [field: string]: Schema } = {
				AND: oneOrMore(self),
				OR: oneOrMore(self),
				NOT: oneOrMore(self),
			}
			const [first, ...rest] = oneOf.kinds
			const others = rest.map(({ field }) => filters(field.target))
			for (const [key, schema] of Object.entries(filters(first.field.target))) {
				const same = JSON.stringify(schema)
				if (others.every((other) => JSON.stringify(other[key]) === same)) {
					fields[key] = schema
				}
			}
			return objectOf(fields)
		})
		return objectOf({
			is: where,
			isNot: where,
			kind: kindOf(doc, model, oneOf),
			...each(oneOf, relation),
		})
	})
}

/** What a kind's write takes, `undefined` when it cannot be written so. */
export type Writers = {
	readonly [op in 'connect' | 'connectOrCreate' | 'create']: (
		field: One,
	) => Schema | undefined
}

/**
 * `CommentTargetCreateNestedInput`: one of `connect`, `connectOrCreate` and
 * `create`, each of one kind; an update's also `disconnect` when optional.
 */
export function oneOfInput(
	doc: Doc,
	model: string,
	oneOf: ServedOneOf,
	creating: boolean,
	writers: Writers,
): Schema {
	const type = named(model, oneOf)
	const name = `${type}${creating ? 'Create' : 'Update'}NestedInput`
	return doc.components.ref(name, () => {
		const fields: { [op: string]: Schema } = {}
		for (const [op, suffix] of [
			['connect', 'Connect'],
			['connectOrCreate', 'CreateOrConnect'],
			['create', 'Create'],
		] as const) {
			const kinds = each(oneOf, writers[op])
			if (Object.keys(kinds).length === 0) continue
			fields[op] = doc.components.ref(`${type}${suffix}Input`, () =>
				oneKey(objectOf(kinds)),
			)
		}
		if (!creating && oneOf.optional) fields['disconnect'] = flag
		return oneKey(objectOf(fields))
	})
}
