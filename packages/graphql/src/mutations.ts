// The writes (D-107): `createPost(data)`, `updatePost(where, data)` and
// `deletePost(where)`, each one kernel write run as its caller. A create
// and an update return the row as the query asks for it, a delete the row
// as it was, without its relations.
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
import { run } from './errors.ts'
import { objectOf, uniqueInput, uniqueWhere } from './inputs.ts'
import { jsonInput, plainData } from './json-fields.ts'
import { upper } from './names.ts'
import { deletedType, isMaster, objectType } from './outputs.ts'
import type { Args, Context, Entry, Registry } from './registry.ts'
import { as, valueType } from './registry.ts'
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

/**
 * A relation's write, named as Prisma names it (D-20, D-128): a create
 * connects or creates, an update also disconnects, unless the relation is a
 * required `one`. `create` takes the target's data without the relation
 * back: `PostCreateInput.comments` is `CommentCreateNestedManyWithoutPostInput
 * { connect, create: [CommentCreateWithoutPostInput!] }`.
 */
function relationInput(
	registry: Registry,
	field: Relation,
	creating: boolean,
): GraphQLInputObjectType {
	const without = `Without${upper(field.inverse)}`
	const many = field.kind === 'many'
	const shape = many ? 'Many' : field.optional ? 'One' : 'OneRequired'
	const name = creating
		? `${field.target}CreateNested${many ? 'Many' : 'One'}${without}Input`
		: `${field.target}Update${shape}${without}NestedInput`
	return registry.input(name, () => {
		const created = dataInput(registry, field.target, true, field.inverse)
		const listed = <T extends GraphQLInputObjectType>(type: T) =>
			many ? new GraphQLList(new GraphQLNonNull(type)) : type
		const row = listed(connectInput(registry))
		const fields: GraphQLInputFieldConfigMap = {
			connect: { type: row },
			create: { type: listed(created) },
		}
		if (!creating && shape !== 'OneRequired') {
			fields['disconnect'] = { type: many ? row : GraphQLBoolean }
		}
		// A `one` relation takes one of them.
		return new GraphQLInputObjectType({ name, fields, isOneOf: !many })
	})
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
 * nor with a default (D-53); the others are optional. A row created through
 * a relation takes `CommentCreateWithoutPostInput`, without that relation
 * (D-128).
 */
function dataInput(
	registry: Registry,
	model: string,
	creating: boolean,
	without?: string,
): GraphQLInputObjectType {
	const name =
		without === undefined
			? `${model}${creating ? 'Create' : 'Update'}Input`
			: `${model}CreateWithout${upper(without)}Input`
	return registry.input(
		name,
		() =>
			new GraphQLInputObjectType({
				name,
				fields: () => {
					const { exposed } = registry.entry(model)
					const required = new Set(creating ? exposed.required : [])
					const fields: GraphQLInputFieldConfigMap = {}
					for (const field of exposed.schema.fields) {
						if (field.name === without) continue
						const type = fieldInput(registry, model, field, creating)
						fields[field.name] = {
							type: required.has(field.name) ? new GraphQLNonNull(type) : type,
						}
					}
					return fields
				},
			}),
	)
}

/** A visible model's three mutations. */
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
		plainData(registry, name, objectOf(args['data']))
	return {
		[`create${name}`]: {
			type: new GraphQLNonNull(type),
			args: { data: data(true) },
			resolve: written(async (args, select, context) =>
				queries.create({ data: dataOf(args), select }, as(context)),
			),
		},
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
		[`delete${name}`]: {
			type: new GraphQLNonNull(deletedType(registry, name)),
			args: { where },
			resolve: async (_, args, context) =>
				run(async () => queries.delete({ where: unique(args) }, as(context))),
		},
	}
}
