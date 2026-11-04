// A `oneOf` over GraphQL (D-247): an object type, not a union, so that its
// JSON is the kernel's and REST's (D-129); its filter takes a kind, each
// kind's relation filter and the fields the kinds share, and its writes are
// `@oneOf` objects of kinds.
import type { ServedOneOf } from '@ultimabase/http/internal'
import { backOf } from '@ultimabase/http/internal'
import type {
	GraphQLInputFieldConfigMap,
	GraphQLInputObjectType as InputType,
} from 'graphql'
import {
	GraphQLBoolean,
	GraphQLEnumType,
	GraphQLInputObjectType,
	GraphQLList,
	GraphQLNonNull,
	GraphQLObjectType,
} from 'graphql'
import type { SchemaField } from 'ultimabase'
import { upper } from './names.ts'
import type { Args, Context, Registry } from './registry.ts'

type One = ServedOneOf['kinds'][number]['field']

/** `CommentTarget` for `Comment.target`. */
const named = (model: string, oneOf: ServedOneOf): string =>
	`${model}${upper(oneOf.name)}`

/** `CommentTargetKind`: the kinds, each by its name. */
function kindType(
	registry: Registry,
	model: string,
	oneOf: ServedOneOf,
): GraphQLEnumType {
	const name = `${named(model, oneOf)}Kind`
	return registry.enum(
		name,
		() =>
			new GraphQLEnumType({
				name,
				values: Object.fromEntries(
					oneOf.kinds.map(({ kind }) => [kind, { value: kind }]),
				),
			}),
	)
}

/** `CommentTarget { kind: CommentTargetKind!, post: Post, photo: Photo }`. */
export function oneOfType(
	registry: Registry,
	model: string,
	oneOf: ServedOneOf,
	object: (model: string) => GraphQLObjectType,
): GraphQLObjectType {
	const name = named(model, oneOf)
	// Its kinds are the relation's level, as a plain `one`'s target (D-185).
	registry.wrappers.add(name)
	return registry.object(
		name,
		() =>
			new GraphQLObjectType<unknown, Context>({
				name,
				// The other kinds read `null`: the row has none of them.
				fields: () => ({
					kind: { type: new GraphQLNonNull(kindType(registry, model, oneOf)) },
					...Object.fromEntries(
						oneOf.kinds.map(({ kind, field }) => [
							kind,
							{ type: object(field.target) },
						]),
					),
				}),
			}),
	)
}

const logical = new Set(['AND', 'OR', 'NOT'])

/**
 * `CommentTargetSharedWhereInput`: each filter every kind's model takes
 * with the same type.
 */
function sharedWhere(
	registry: Registry,
	model: string,
	oneOf: ServedOneOf,
	where: (model: string) => InputType,
): InputType {
	const name = `${named(model, oneOf)}SharedWhereInput`
	return registry.input(
		name,
		() =>
			new GraphQLInputObjectType({
				name,
				fields: () => {
					const self = sharedWhere(registry, model, oneOf, where)
					const each = new GraphQLList(new GraphQLNonNull(self))
					const fields: GraphQLInputFieldConfigMap = {
						AND: { type: each },
						OR: { type: each },
						NOT: { type: each },
					}
					const [first, ...rest] = oneOf.kinds
					const others = rest.map(({ field }) =>
						where(field.target).getFields(),
					)
					const fieldsOf = where(first.field.target).getFields()
					for (const [key, { type }] of Object.entries(fieldsOf)) {
						if (logical.has(key)) continue
						if (others.every((other) => other[key]?.type === type)) {
							fields[key] = { type }
						}
					}
					return fields
				},
			}),
	)
}

/**
 * `CommentTargetFilter`: `is` and `isNot` on the shared fields, `kind`, and
 * each kind as a `one` relation's filter.
 */
export function oneOfFilter(
	registry: Registry,
	model: string,
	oneOf: ServedOneOf,
	where: (model: string) => InputType,
	relation: (field: One) => InputType,
): InputType {
	const name = `${named(model, oneOf)}Filter`
	return registry.input(
		name,
		() =>
			new GraphQLInputObjectType({
				name,
				fields: () => {
					const shared = sharedWhere(registry, model, oneOf, where)
					return {
						is: { type: shared },
						isNot: { type: shared },
						kind: { type: kindType(registry, model, oneOf) },
						...Object.fromEntries(
							oneOf.kinds.map(({ kind, field }) => [
								kind,
								{ type: relation(field) },
							]),
						),
					}
				},
			}),
	)
}

/** The relation back, as declared: a `oneOf` for its kind's key (D-247). */
export const back = (
	registry: Registry,
	field: Exclude<SchemaField, { readonly kind: 'scalar' }>,
): string | undefined => backOf(field, registry.entry(field.target).model)

/** What a kind's write takes, `undefined` when it cannot be written so. */
export type Writers = {
	readonly [op in 'connect' | 'connectOrCreate' | 'create']: (
		field: One,
	) => InputType | undefined
}

/** `CommentTargetConnectInput @oneOf { post, photo }`, or none to write. */
function kindsInput(
	registry: Registry,
	name: string,
	oneOf: ServedOneOf,
	of: (field: One) => InputType | undefined,
): InputType | undefined {
	const fields: GraphQLInputFieldConfigMap = {}
	for (const { kind, field } of oneOf.kinds) {
		const type = of(field)
		if (type !== undefined) fields[kind] = { type }
	}
	if (Object.keys(fields).length === 0) return undefined
	return registry.input(
		name,
		() => new GraphQLInputObjectType({ name, fields, isOneOf: true }),
	)
}

/**
 * `CommentTargetCreateNestedInput @oneOf { connect, connectOrCreate,
 * create }`, each of a kind; an update's also `disconnect` when optional.
 */
export function oneOfInput(
	registry: Registry,
	model: string,
	oneOf: ServedOneOf,
	creating: boolean,
	writers: Writers,
): InputType {
	const type = named(model, oneOf)
	const name = `${type}${creating ? 'Create' : 'Update'}NestedInput`
	return registry.input(name, () => {
		const fields: GraphQLInputFieldConfigMap = {}
		for (const [op, suffix] of [
			['connect', 'Connect'],
			['connectOrCreate', 'CreateOrConnect'],
			['create', 'Create'],
		] as const) {
			const at = `${type}${suffix}Input`
			const input = kindsInput(registry, at, oneOf, writers[op])
			if (input !== undefined) fields[op] = { type: input }
		}
		if (!creating && oneOf.optional)
			fields['disconnect'] = { type: GraphQLBoolean }
		return new GraphQLInputObjectType({ name, fields, isOneOf: true })
	})
}

/** The kernel's write of a `oneOf`: each kind's row as its model's data. */
export function oneOfData(
	oneOf: ServedOneOf,
	value: Args,
	row: (target: string, item: unknown) => Args,
	unique: (target: string, item: unknown) => Args,
): Args {
	const write: { [key: string]: unknown } = { ...value }
	const map = (
		op: string,
		read: (target: string, item: unknown) => unknown,
	) => {
		const operand: unknown = write[op]
		if (typeof operand !== 'object' || operand === null) return
		const kinds: { [kind: string]: unknown } = {}
		for (const { kind, field } of oneOf.kinds) {
			if (kind in operand) {
				kinds[kind] = read(field.target, Reflect.get(operand, kind))
			}
		}
		write[op] = kinds
	}
	map('create', row)
	map('connectOrCreate', (target, item) => ({
		where: unique(target, Reflect.get(Object(item), 'where')),
		create: row(target, Reflect.get(Object(item), 'create')),
	}))
	return write
}
