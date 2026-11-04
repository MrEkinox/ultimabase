// The writes (D-107): `createPost(data)`, `updatePost(where, data)`,
// `upsertPost(where, create, update)` (D-142) and `deletePost(where)`, each
// one kernel write run as its caller. A create, an update and an upsert
// return the row as the query asks for it, a delete the row as it was,
// without its relations.
import { declared, oneOfsOf, run } from '@ultimabase/http/internal'
import type {
	GraphQLFieldConfig,
	GraphQLInputFieldConfigMap,
	GraphQLNullableInputType,
} from 'graphql'
import {
	GraphQLBoolean,
	GraphQLID,
	GraphQLInputObjectType,
	GraphQLList,
	GraphQLNonNull,
} from 'graphql'
import type { SchemaField } from 'ultimabase'
import { objectOf, uniqueInput, uniqueWhere } from './inputs.ts'
import { jsonInput, plainData } from './json-fields.ts'
import { upper } from './names.ts'
import { back, oneOfData, oneOfInput } from './one-ofs.ts'
import { deletedType, isMaster, objectType } from './outputs.ts'
import type { Args, Context, Entry, Registry } from './registry.ts'
import { as, described, valueType } from './registry.ts'
import { JSONScalar } from './scalars.ts'
import { selectOf } from './select.ts'

type Fields = { [field: string]: GraphQLFieldConfig<unknown, Context, Args> }

/** `ConnectInput { id }`: what a relation write names a row by. */
const connectInput = (registry: Registry): GraphQLInputObjectType =>
	registry.input(
		'ConnectInput',
		() =>
			new GraphQLInputObjectType({
				name: 'ConnectInput',
				fields: { id: { type: new GraphQLNonNull(GraphQLID) } },
			}),
	)

type Relation = Exclude<SchemaField, { readonly kind: 'scalar' }>

// A `one` without a target's side takes the target's whole input (D-237).
const facing = (registry: Registry, field: Relation): string => {
	const inverse = back(registry, field)
	return inverse === undefined ? '' : `Without${upper(inverse)}`
}

/** A view is read-only (D-151, D-240). */
const isView = (field: SchemaField): boolean =>
	(field.kind === 'many' || (field.kind === 'one' && !field.stored)) &&
	field.from !== undefined

/**
 * Whether a model's data input has a field, `without` aside: GraphQL has no
 * empty input object, so an empty one is not generated, nor what takes it
 * (D-227).
 */
const writes = (registry: Registry, model: string, without?: string) =>
	registry
		.entry(model)
		.exposed.schema.fields.some(
			(field) => declared(field) !== without && !isView(field),
		)

/** Whether a relation creates its target: a visible one with data. */
const creates = (registry: Registry, field: Relation): boolean =>
	registry.entry(field.target).visible &&
	writes(registry, field.target, back(registry, field))

/** `CommentCreateOrConnectWithoutPostInput { where, create }` (D-138). */
const orCreateInput = (
	registry: Registry,
	field: Relation,
): GraphQLInputObjectType => {
	const name = `${field.target}CreateOrConnect${facing(registry, field)}Input`
	return registry.input(
		name,
		() =>
			new GraphQLInputObjectType({
				name,
				fields: () => ({
					where: {
						type: new GraphQLNonNull(uniqueInput(registry, field.target)),
					},
					create: {
						type: new GraphQLNonNull(
							dataInput(registry, field.target, true, back(registry, field)),
						),
					},
				}),
			}),
	)
}

/** `CommentUpdateWithWhereUniqueWithoutPostInput { where, data }` (D-138). */
const updateWhereInput = (
	registry: Registry,
	field: Relation,
): GraphQLInputObjectType => {
	const name = `${field.target}UpdateWithWhereUnique${facing(registry, field)}Input`
	return registry.input(
		name,
		() =>
			new GraphQLInputObjectType({
				name,
				fields: () => ({
					where: {
						type: new GraphQLNonNull(uniqueInput(registry, field.target)),
					},
					data: {
						type: new GraphQLNonNull(
							dataInput(registry, field.target, false, back(registry, field)),
						),
					},
				}),
			}),
	)
}

/**
 * A relation's write, named as Prisma names it (D-20, D-128, D-138): a
 * create connects or creates, an update also disconnects, unless the
 * relation is a required `one`, and updates or deletes a linked row; a
 * `many` is also `set`. `create` takes the target's data without the
 * relation back: `PostCreateInput.comments` is
 * `CommentCreateNestedManyWithoutPostInput { connect, connectOrCreate,
 * create: [CommentCreateWithoutPostInput!] }`. A hidden model is not
 * created, updated or deleted over GraphQL, through a relation either, as
 * in Parse.
 */
function relationInput(
	registry: Registry,
	field: Relation,
	creating: boolean,
): GraphQLInputObjectType {
	const many = field.kind === 'many'
	const shape = many ? 'Many' : field.optional ? 'One' : 'OneRequired'
	const name = creating
		? `${field.target}CreateNested${many ? 'Many' : 'One'}${facing(registry, field)}Input`
		: `${field.target}Update${shape}${facing(registry, field)}NestedInput`
	return registry.input(name, () => {
		const listed = <T extends GraphQLInputObjectType>(type: T) =>
			many ? new GraphQLList(new GraphQLNonNull(type)) : type
		const row = listed(connectInput(registry))
		const visible = registry.entry(field.target).visible
		const updating = !creating && visible
		const data = writes(registry, field.target, back(registry, field))
		const fields: GraphQLInputFieldConfigMap = { connect: { type: row } }
		if (visible && data) {
			fields['connectOrCreate'] = {
				type: listed(orCreateInput(registry, field)),
			}
			const created = dataInput(
				registry,
				field.target,
				true,
				back(registry, field),
			)
			fields['create'] = { type: listed(created) }
		}
		if (updating && shape !== 'OneRequired') {
			const unique = uniqueInput(registry, field.target)
			fields['delete'] = { type: many ? listed(unique) : GraphQLBoolean }
		}
		if (!creating && shape !== 'OneRequired') {
			fields['disconnect'] = { type: many ? row : GraphQLBoolean }
		}
		// A filtered relation takes no `set` (D-151).
		if (!creating && many && field.filtered !== true) {
			fields['set'] = { type: row }
		}
		if (updating && data) {
			fields['update'] = {
				type: many
					? listed(updateWhereInput(registry, field))
					: dataInput(registry, field.target, false, back(registry, field)),
			}
		}
		// A `one` relation takes one of them.
		return new GraphQLInputObjectType({ name, fields, isOneOf: !many })
	})
}

/**
 * The kernel's data from a mutation's: its json values plain, and each
 * nested row's data and unique target too (D-128, D-138).
 */
function kernelData(registry: Registry, model: string, data: Args): Args {
	const plained: { [field: string]: unknown } = plainData(registry, model, data)
	for (const field of registry.entry(model).model.fields) {
		const value = plained[field.name]
		if (field.kind === 'scalar' || typeof value !== 'object' || value === null)
			continue
		const { target } = field
		const row = (item: unknown) => kernelData(registry, target, objectOf(item))
		const unique = (item: unknown) =>
			uniqueWhere(registry, target, objectOf(item))
		const write: { [key: string]: unknown } = { ...value }
		const map = (key: string, read: (item: unknown) => unknown) => {
			const operand = write[key]
			if (operand === undefined || operand === null) return
			write[key] = Array.isArray(operand) ? operand.map(read) : read(operand)
		}
		map('create', row)
		map('connectOrCreate', (item) => {
			const { where, create } = objectOf(item)
			return { where: unique(where), create: row(create) }
		})
		if (field.kind === 'many') {
			map('update', (item) => {
				const { where, data: changes } = objectOf(item)
				return { where: unique(where), data: row(changes) }
			})
			map('delete', unique)
		} else map('update', row)
		plained[field.name] = write
	}
	for (const oneOf of oneOfsOf(registry.entry(model).model)) {
		const value = plained[oneOf.name]
		if (typeof value !== 'object' || value === null) continue
		plained[oneOf.name] = oneOfData(
			oneOf,
			objectOf(value),
			(target, item) => kernelData(registry, target, objectOf(item)),
			(target, item) => uniqueWhere(registry, target, objectOf(item)),
		)
	}
	return plained
}

function fieldInput(
	registry: Registry,
	model: string,
	field: SchemaField,
	creating: boolean,
): GraphQLNullableInputType {
	if (field.kind === 'scalar' && field.type === 'json') {
		return jsonInput(registry, model, field).type
	}
	// A plugin field's schema takes its JSON (D-122).
	if (registry.entry(model).exposed.fieldTypes[field.name] !== undefined) {
		return JSONScalar
	}
	if (field.kind === 'scalar') return valueType(registry, model, field)
	return relationInput(registry, field, creating)
}

/**
 * `PostCreateInput` and `PostUpdateInput`: every field, those only Master
 * reads included. A create needs the fields its type needs, neither optional
 * nor with a default (D-53); the others are optional. A row created or
 * updated through a relation takes `CommentCreateWithoutPostInput` or
 * `CommentUpdateWithoutPostInput`, without that relation (D-128, D-138).
 */
function dataInput(
	registry: Registry,
	model: string,
	creating: boolean,
	without?: string,
): GraphQLInputObjectType {
	const name = `${model}${creating ? 'Create' : 'Update'}${
		without === undefined ? '' : `Without${upper(without)}`
	}Input`
	return registry.input(
		name,
		() =>
			new GraphQLInputObjectType({
				name,
				fields: () => {
					const { exposed } = registry.entry(model)
					const required = new Set(creating ? exposed.required : [])
					const fields: GraphQLInputFieldConfigMap = {}
					const needed = (key: string, type: GraphQLNullableInputType) => ({
						type: required.has(key) ? new GraphQLNonNull(type) : type,
					})
					for (const field of exposed.schema.fields) {
						if (declared(field) === without || isView(field)) continue
						// A `oneOf`'s kinds are written through it (D-247).
						if (field.kind === 'one' && field.of !== undefined) continue
						const type = fieldInput(registry, model, field, creating)
						fields[field.name] = needed(field.name, type)
					}
					for (const oneOf of oneOfsOf(exposed.schema)) {
						if (oneOf.name === without) continue
						const type = oneOfInput(registry, model, oneOf, creating, {
							connect: () => connectInput(registry),
							connectOrCreate: (field) =>
								creates(registry, field)
									? orCreateInput(registry, field)
									: undefined,
							create: (field) =>
								creates(registry, field)
									? dataInput(
											registry,
											field.target,
											true,
											back(registry, field),
										)
									: undefined,
						})
						fields[oneOf.name] = needed(oneOf.name, type)
					}
					return described(registry.entry(model), fields)
				},
			}),
	)
}

/** A visible model's four mutations. */
export function mutationFields(registry: Registry, entry: Entry): Fields {
	const name = entry.model.name
	const type = objectType(registry, name)
	const { queries } = entry.exposed
	const where = { type: new GraphQLNonNull(uniqueInput(registry, name)) }
	const data = (creating: boolean) => ({
		type: new GraphQLNonNull(dataInput(registry, name, creating)),
	})
	const written =
		(
			write: (args: Args, select: Args, context: Context) => Promise<unknown>,
		): GraphQLFieldConfig<unknown, Context, Args>['resolve'] =>
		async (_, args, context, info) => {
			const select = selectOf(
				registry,
				info,
				type,
				info.fieldNodes,
				isMaster(context),
			)
			return run(() => write(args, select, context))
		}
	const unique = (args: Args): Args =>
		uniqueWhere(registry, name, objectOf(args['where']))
	const dataOf = (args: Args): Args =>
		kernelData(registry, name, objectOf(args['data']))
	// A model without a field is created with no data, and not updated (D-227).
	const writable = writes(registry, name)
	const create: Fields = {
		[`create${name}`]: {
			type: new GraphQLNonNull(type),
			args: writable ? { data: data(true) } : {},
			resolve: written(async (args, select, context) =>
				queries.create({ data: dataOf(args), select }, as(context)),
			),
		},
	}
	const deleted: Fields = {
		[`delete${name}`]: {
			type: new GraphQLNonNull(deletedType(registry, name)),
			args: { where },
			resolve: async (_, args, context) =>
				run(async () => queries.delete({ where: unique(args) }, as(context))),
		},
	}
	if (!writable) return { ...create, ...deleted }
	return {
		...create,
		[`update${name}`]: {
			type: new GraphQLNonNull(type),
			args: { where, data: data(false) },
			resolve: written(async (args, select, context) =>
				queries.update(
					{ where: unique(args), data: dataOf(args), select },
					as(context),
				),
			),
		},
		// The row it created or updated, as either branch returns it (D-142).
		[`upsert${name}`]: {
			type: new GraphQLNonNull(type),
			args: { where, create: data(true), update: data(false) },
			resolve: written(async (args, select, context) => {
				const { row } = await entry.exposed.upsert(
					{
						where: unique(args),
						create: kernelData(registry, name, objectOf(args['create'])),
						update: kernelData(registry, name, objectOf(args['update'])),
						select,
					},
					as(context),
				)
				return row
			}),
		},
		...deleted,
	}
}
