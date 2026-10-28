// The read inputs (D-107), as the query API spells them (D-20): filters,
// `where`, `orderBy` and the `@oneOf` unique target.
import { readable } from '@ultimabase/http/internal'
import type {
	GraphQLInputFieldConfigMap,
	GraphQLInputType,
	GraphQLNamedInputType,
	GraphQLScalarType,
} from 'graphql'
import {
	GraphQLBoolean,
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
import { scalarType } from './registry.ts'
import { DateTime } from './scalars.ts'

/** An input object's value, as the kernel's arguments. */
export const objectOf = (value: unknown): Args =>
	typeof value === 'object' && value !== null ? { ...value } : {}

/** Whether a model has fields its `_search` matches (D-148). */
const searched = (fields: readonly SchemaField[]): boolean =>
	fields.some((field) => field.kind === 'scalar' && field.search === true)

const list = <T extends GraphQLNamedInputType>(
	type: T,
): GraphQLList<GraphQLNonNull<T>> => new GraphQLList(new GraphQLNonNull(type))

const base = ['equals', 'not', 'in', 'notIn']
const ordered = [...base, 'lt', 'lte', 'gt', 'gte']
const text = [...base, 'contains', 'startsWith', 'endsWith']

/** `QueryMode`: a string filter's operators ignore case (D-140). */
const queryMode = (registry: Registry): GraphQLEnumType =>
	registry.enum(
		'QueryMode',
		() =>
			new GraphQLEnumType({
				name: 'QueryMode',
				values: { insensitive: { value: 'insensitive' } },
			}),
	)

/** The input type of a filter's operator. */
function operand(
	registry: Registry,
	type: GraphQLNamedInputType,
	operator: string,
): GraphQLInputType {
	if (operator === 'mode') return queryMode(registry)
	if (operator === 'path') return list(GraphQLString)
	if (operator.startsWith('string')) return GraphQLString
	return operator === 'in' || operator === 'notIn' ? list(type) : type
}

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
						{ type: operand(registry, type, operator) },
					]),
				),
			}),
	)
}

/** Each scalar type's operators: no order on strings, as the kernel. */
const operators: { readonly [T in Scalar['type']]: readonly string[] } = {
	string: [...text, 'mode'],
	number: ordered,
	decimal: ordered,
	dateTime: ordered,
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

/**
 * `StringListFilter`, `FloatListFilter`, `ProductSizesListFilter`: no
 * shorthand, `NOT` gives the opposite (D-120, D-127, D-149).
 */
const listFilter = (
	registry: Registry,
	item: GraphQLScalarType | GraphQLEnumType,
): GraphQLInputObjectType => {
	const name = `${item.name}ListFilter`
	return registry.input(
		name,
		() =>
			new GraphQLInputObjectType({
				name,
				fields: {
					has: { type: item },
					hasSome: { type: list(item) },
					hasEvery: { type: list(item) },
					isEmpty: { type: GraphQLBoolean },
				},
			}),
	)
}

const scalarFilter = (
	registry: Registry,
	model: string,
	field: Scalar,
): GraphQLInputObjectType => {
	const item = scalarType(registry, model, field)
	if (field.list) return listFilter(registry, item)
	return filter(registry, item, operators[field.type])
}

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
					const entry = registry.entry(model)
					if (searched(readable(entry))) {
						fields['_search'] = { type: GraphQLString }
					}
					for (const field of readable(entry)) {
						// Only a beforeFind filters a plugin field (D-122).
						if (entry.exposed.fieldTypes[field.name] !== undefined) continue
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

/** `CountOrderByInput`: a `many` relation sorted by its rows (D-134). */
const countOrderBy = (registry: Registry): GraphQLInputObjectType =>
	registry.input(
		'CountOrderByInput',
		() =>
			new GraphQLInputObjectType({
				name: 'CountOrderByInput',
				fields: { _count: { type: sortOrder(registry) } },
			}),
	)

/**
 * `PostOrderByInput`: scalar fields but json, lists and plugin fields, as
 * the kernel sorts (D-94, D-120, D-122); a `one` relation as its target's,
 * a `many` one by its count (D-134).
 */
export function orderByInput(
	registry: Registry,
	model: string,
): GraphQLInputObjectType {
	const name = `${model}OrderByInput`
	return registry.input(
		name,
		() =>
			new GraphQLInputObjectType({
				name,
				fields: () => {
					const type = sortOrder(registry)
					const fields: GraphQLInputFieldConfigMap = {
						id: { type },
						createdAt: { type },
						updatedAt: { type },
					}
					const entry = registry.entry(model)
					// The kernel refuses it in a relation's: a read ranks by its own search.
					if (searched(readable(entry))) fields['_relevance'] = { type }
					for (const field of readable(entry)) {
						if (field.kind === 'one') {
							fields[field.name] = {
								type: orderByInput(registry, field.target),
							}
						} else if (field.kind === 'many') {
							fields[field.name] = { type: countOrderBy(registry) }
						} else if (
							field.type !== 'json' &&
							!field.list &&
							entry.exposed.fieldTypes[field.name] === undefined
						) {
							fields[field.name] = { type }
						}
					}
					return fields
				},
			}),
	)
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
