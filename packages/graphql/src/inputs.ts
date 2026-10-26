// The read inputs (D-107), as the query API spells them (D-20): filters,
// `where`, `orderBy` and the `@oneOf` unique target.
import type { GraphQLInputFieldConfigMap, GraphQLNamedInputType } from 'graphql'
import {
	GraphQLEnumType,
	GraphQLID,
	GraphQLInputObjectType,
	GraphQLList,
	GraphQLNonNull,
	GraphQLString,
} from 'graphql'
import type { SchemaField } from 'ultimabase'
import { upper } from './names.ts'
import type { Args, Registry, Scalar } from './registry.ts'
import { readable, scalarType } from './registry.ts'
import { DateTime } from './scalars.ts'

/** An input object's value, as the kernel's arguments. */
export const objectOf = (value: unknown): Args =>
	typeof value === 'object' && value !== null ? { ...value } : {}

const list = <T extends GraphQLNamedInputType>(
	type: T,
): GraphQLList<GraphQLNonNull<T>> => new GraphQLList(new GraphQLNonNull(type))

const base = ['equals', 'not', 'in', 'notIn']
const ordered = [...base, 'lt', 'lte', 'gt', 'gte']
const text = [...base, 'contains', 'startsWith', 'endsWith']

/** `StringFilter`, `FloatFilter`, `PostStatusFilter`: the kernel's operators. */
function filter(
	registry: Registry,
	type: GraphQLNamedInputType,
	operators: readonly string[],
): GraphQLInputObjectType {
	const name = `${type.name}Filter`
	return registry.input(
		name,
		() =>
			new GraphQLInputObjectType({
				name,
				fields: Object.fromEntries(
					operators.map((operator) => [
						operator,
						{
							type:
								operator === 'in' || operator === 'notIn' ? list(type) : type,
						},
					]),
				),
			}),
	)
}

/** Each scalar type's operators: no order on strings, as the kernel. */
const operators: {
	readonly [T in Exclude<Scalar['type'], 'stringList'>]: readonly string[]
} = {
	string: text,
	number: ordered,
	date: ordered,
	boolean: base,
	json: base,
	enum: base,
}

/** `StringListFilter`: no shorthand, `NOT` gives the opposite (D-120). */
const listFilter = (registry: Registry): GraphQLInputObjectType =>
	registry.input(
		'StringListFilter',
		() =>
			new GraphQLInputObjectType({
				name: 'StringListFilter',
				fields: {
					has: { type: GraphQLString },
					hasSome: { type: list(GraphQLString) },
				},
			}),
	)

const scalarFilter = (
	registry: Registry,
	model: string,
	field: Scalar,
): GraphQLInputObjectType =>
	field.type === 'stringList'
		? listFilter(registry)
		: filter(
				registry,
				scalarType(registry, model, field),
				operators[field.type],
			)

const relationFilter = (
	registry: Registry,
	field: Exclude<SchemaField, Scalar>,
): GraphQLInputObjectType => {
	const one = field.kind === 'one'
	const name = `${field.target}${one ? 'Relation' : 'ListRelation'}Filter`
	return registry.input(
		name,
		() =>
			new GraphQLInputObjectType({
				name,
				fields: () => {
					const type = whereInput(registry, field.target)
					return Object.fromEntries(
						(one ? ['is', 'isNot'] : ['some', 'every', 'none']).map((key) => [
							key,
							{ type },
						]),
					)
				},
			}),
	)
}

/** `PostWhereInput`. */
export function whereInput(
	registry: Registry,
	model: string,
): GraphQLInputObjectType {
	const name = `${model}WhereInput`
	return registry.input(
		name,
		() =>
			new GraphQLInputObjectType({
				name,
				fields: () => {
					const self = whereInput(registry, model)
					const fields: GraphQLInputFieldConfigMap = {
						AND: { type: list(self) },
						OR: { type: list(self) },
						NOT: { type: list(self) },
						id: { type: filter(registry, GraphQLID, base) },
						createdAt: { type: filter(registry, DateTime, ordered) },
						updatedAt: { type: filter(registry, DateTime, ordered) },
					}
					for (const field of readable(registry.entry(model))) {
						fields[field.name] = {
							type:
								field.kind === 'scalar'
									? scalarFilter(registry, model, field)
									: relationFilter(registry, field),
						}
					}
					return fields
				},
			}),
	)
}

const sortOrder = (registry: Registry): GraphQLEnumType =>
	registry.enum(
		'SortOrder',
		() =>
			new GraphQLEnumType({
				name: 'SortOrder',
				values: { asc: { value: 'asc' }, desc: { value: 'desc' } },
			}),
	)

/**
 * `PostOrderByInput`: scalar fields but json and lists, as the kernel sorts
 * (D-94, D-120).
 */
export function orderByInput(
	registry: Registry,
	model: string,
): GraphQLInputObjectType {
	const name = `${model}OrderByInput`
	return registry.input(name, () => {
		const type = sortOrder(registry)
		const names = ['id', 'createdAt', 'updatedAt']
		for (const field of readable(registry.entry(model))) {
			if (
				field.kind === 'scalar' &&
				field.type !== 'json' &&
				field.type !== 'stringList'
			) {
				names.push(field.name)
			}
		}
		return new GraphQLInputObjectType({
			name,
			fields: Object.fromEntries(names.map((field) => [field, { type }])),
		})
	})
}

/** A unique field's type: a `one` relation's is its target's `ID`. */
function uniqueType(
	registry: Registry,
	model: string,
	name: string,
): GraphQLNamedInputType {
	const field = registry.entry(model).model.fields.find((f) => f.name === name)
	return field?.kind === 'scalar'
		? scalarType(registry, model, field)
		: GraphQLID
}

const compositeName = (fields: readonly string[]): string => fields.join('_')

/**
 * `PostWhereUniqueInput @oneOf`: `id`, each unique field, and each unique
 * index as `author_slug: { author, slug }`.
 */
export function uniqueInput(
	registry: Registry,
	model: string,
): GraphQLInputObjectType {
	const name = `${model}WhereUniqueInput`
	return registry.input(name, () => {
		const fields: GraphQLInputFieldConfigMap = {}
		const { exposed } = registry.entry(model)
		// A field only Master reads is absent, as from the filters (D-44).
		const uniques = exposed.uniques.filter((unique) =>
			unique.every((field) => exposed.readRules[field] !== 'private'),
		)
		for (const unique of uniques) {
			const [only] = unique
			if (unique.length === 1 && only !== undefined) {
				fields[only] = { type: uniqueType(registry, model, only) }
				continue
			}
			const key = compositeName(unique)
			const composite = `${model}${unique.map(upper).join('')}UniqueInput`
			fields[key] = {
				type: new GraphQLInputObjectType({
					name: composite,
					fields: Object.fromEntries(
						unique.map((field) => [
							field,
							{ type: new GraphQLNonNull(uniqueType(registry, model, field)) },
						]),
					),
				}),
			}
		}
		return new GraphQLInputObjectType({ name, fields, isOneOf: true })
	})
}

/** A `@oneOf` unique target as the kernel's flat `where`. */
export function uniqueWhere(
	registry: Registry,
	model: string,
	where: Args,
): Args {
	const composites = new Set(
		registry
			.entry(model)
			.exposed.uniques.filter((unique) => unique.length > 1)
			.map(compositeName),
	)
	const flat: { [field: string]: unknown } = {}
	for (const [key, value] of Object.entries(where)) {
		if (composites.has(key) && typeof value === 'object') {
			Object.assign(flat, value)
		} else flat[key] = value
	}
	return flat
}
