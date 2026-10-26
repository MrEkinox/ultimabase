// The output types (D-107): each model's object type, its edges and
// connections, and the arguments of its lists.
import type {
	GraphQLFieldConfig,
	GraphQLFieldConfigArgumentMap,
	GraphQLFieldConfigMap,
} from 'graphql'
import {
	GraphQLBoolean,
	GraphQLID,
	GraphQLInt,
	GraphQLList,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLString,
} from 'graphql'
import type { SchemaField } from 'ultimabase'
import { orderByInput, whereInput } from './inputs.ts'
import { upper } from './names.ts'
import { connection, listRead, rowsOf } from './pages.ts'
import type { Args, Context, Registry } from './registry.ts'
import { readable, valueType } from './registry.ts'
import { DateTime } from './scalars.ts'

const required = <T extends GraphQLObjectType>(type: T) =>
	new GraphQLNonNull(type)

export const isMaster = (context: Context): boolean =>
	context.caller.kind === 'master'

/** `first`, `after`, `last`, `before`, or `take` and `skip`; then filters. */
export function listArgs(
	registry: Registry,
	model: string,
): GraphQLFieldConfigArgumentMap {
	const pages: GraphQLFieldConfigArgumentMap =
		registry.settings.pagination === 'list'
			? { take: { type: GraphQLInt }, skip: { type: GraphQLInt } }
			: {
					first: { type: GraphQLInt },
					after: { type: GraphQLString },
					last: { type: GraphQLInt },
					before: { type: GraphQLString },
				}
	return {
		...pages,
		where: { type: whereInput(registry, model) },
		orderBy: {
			type: new GraphQLList(new GraphQLNonNull(orderByInput(registry, model))),
		},
	}
}

const pageInfo = (registry: Registry): GraphQLObjectType =>
	registry.object(
		'PageInfo',
		() =>
			new GraphQLObjectType({
				name: 'PageInfo',
				fields: {
					hasNextPage: { type: new GraphQLNonNull(GraphQLBoolean) },
					hasPreviousPage: { type: new GraphQLNonNull(GraphQLBoolean) },
					startCursor: { type: GraphQLString },
					endCursor: { type: GraphQLString },
				},
			}),
	)

const edge = (registry: Registry, model: string): GraphQLObjectType =>
	registry.object(
		`${model}Edge`,
		() =>
			new GraphQLObjectType({
				name: `${model}Edge`,
				fields: () => ({
					cursor: { type: new GraphQLNonNull(GraphQLString) },
					node: { type: required(objectType(registry, model)) },
				}),
			}),
	)

/**
 * `PostConnection`, with `totalCount`, at the root; `UserPostsConnection`,
 * without it, on a relation (D-107).
 */
export function connectionType(
	registry: Registry,
	name: string,
	model: string,
	counted: boolean,
): GraphQLObjectType {
	return registry.object(
		name,
		() =>
			new GraphQLObjectType({
				name,
				fields: () => ({
					edges: {
						type: new GraphQLNonNull(
							new GraphQLList(required(edge(registry, model))),
						),
					},
					pageInfo: { type: required(pageInfo(registry)) },
					// A function the default resolver calls: counted when selected.
					...(counted
						? { totalCount: { type: new GraphQLNonNull(GraphQLInt) } }
						: {}),
				}),
			}),
	)
}

/**
 * A relation's value in its row: `null` when absent and its read rule may
 * hide it. Absent otherwise, the resolver that returned the row did not read
 * it, such as one `extend` added.
 */
function readOf(
	source: unknown,
	model: string,
	field: string,
	ruled: boolean,
): unknown {
	const value: unknown = Reflect.get(Object(source), field)
	if (value !== undefined) return value
	if (ruled) return null
	throw new Error(
		`${model}.${field} was not read; select it with context.select(info).`,
	)
}

/** A `many` relation: a connection, or a list with `pagination: 'list'`. */
function manyField(
	registry: Registry,
	model: string,
	field: Extract<SchemaField, { readonly kind: 'many' }>,
	ruled: boolean,
): GraphQLFieldConfig<unknown, Context, Args> {
	const target = objectType(registry, field.target)
	const type =
		registry.settings.pagination === 'list'
			? new GraphQLList(required(target))
			: connectionType(
					registry,
					`${model}${upper(field.name)}Connection`,
					field.target,
					false,
				)
	return {
		// Absent when the field's read rule hides it (D-44).
		type: ruled ? type : new GraphQLNonNull(type),
		args: listArgs(registry, field.target),
		resolve: (source, args, context) => {
			const value = readOf(source, model, field.name, ruled)
			if (value === null) return null
			const rows = rowsOf(value)
			const { page } = listRead(
				registry.settings.pagination,
				registry.entry(field.target),
				args,
				isMaster(context),
			)
			return page === undefined ? rows : connection(rows, page)
		},
	}
}

/** `id`, the dates and each scalar field a caller other than Master reads. */
function scalarFields(
	registry: Registry,
	model: string,
): GraphQLFieldConfigMap<unknown, Context> {
	const entry = registry.entry(model)
	const fields: GraphQLFieldConfigMap<unknown, Context> = {
		id: { type: new GraphQLNonNull(GraphQLID) },
		createdAt: { type: new GraphQLNonNull(DateTime) },
		updatedAt: { type: new GraphQLNonNull(DateTime) },
	}
	for (const field of readable(entry)) {
		if (field.kind !== 'scalar') continue
		const ruled = entry.exposed.readRules[field.name] === 'rule'
		const type = valueType(registry, model, field)
		fields[field.name] = {
			type: field.optional || ruled ? type : new GraphQLNonNull(type),
		}
	}
	return fields
}

/** `Post`: a field only Master reads is absent, a ruled one nullable. */
export function objectType(
	registry: Registry,
	model: string,
): GraphQLObjectType {
	return registry.object(
		model,
		() =>
			new GraphQLObjectType<unknown, Context>({
				name: model,
				fields: () => {
					const entry = registry.entry(model)
					const fields = scalarFields(registry, model)
					for (const field of readable(entry)) {
						const ruled = entry.exposed.readRules[field.name] === 'rule'
						if (field.kind === 'one') {
							// Its target's read rule may hide the row (D-86).
							fields[field.name] = {
								type: objectType(registry, field.target),
								resolve: (source) => readOf(source, model, field.name, ruled),
							}
						} else if (field.kind === 'many') {
							fields[field.name] = manyField(registry, model, field, ruled)
						}
					}
					return fields
				},
			}),
	)
}

/** `DeletedPost`: a deleted row as it was, without its relations (D-102). */
export function deletedType(
	registry: Registry,
	model: string,
): GraphQLObjectType {
	const name = `Deleted${model}`
	return registry.object(
		name,
		() =>
			new GraphQLObjectType<unknown, Context>({
				name,
				fields: () => scalarFields(registry, model),
			}),
	)
}
