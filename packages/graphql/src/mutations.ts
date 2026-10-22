// The writes (D-107): `createPost(data)`, `updatePost(where, data)` and
// `deletePost(where)`, each one kernel write run as its caller. A create
// and an update return the row as the query asks for it, a delete the row
// as it was, without its relations.
import type {
	GraphQLFieldConfig,
	GraphQLInputFieldConfigMap,
	GraphQLInputType,
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
import { upper } from './names.ts'
import { deletedType, isMaster, objectType } from './outputs.ts'
import type { Args, Context, Entry, Registry } from './registry.ts'
import { as, scalarType } from './registry.ts'
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

/**
 * A relation's write, the same for every target: a create connects, an
 * update connects or disconnects (D-20).
 */
function relationInput(
	registry: Registry,
	kind: 'one' | 'many',
	creating: boolean,
): GraphQLInputObjectType {
	const name = `${creating ? 'Create' : 'Update'}${upper(kind)}RelationInput`
	return registry.input(name, () => {
		const row = connectInput(registry)
		const type = kind === 'one' ? row : new GraphQLList(new GraphQLNonNull(row))
		if (creating) {
			return new GraphQLInputObjectType({
				name,
				fields: { connect: { type: new GraphQLNonNull(type) } },
			})
		}
		return new GraphQLInputObjectType({
			name,
			fields: {
				connect: { type },
				disconnect: { type: kind === 'one' ? GraphQLBoolean : type },
			},
			// A `one` relation takes one of them.
			isOneOf: kind === 'one',
		})
	})
}

function fieldInput(
	registry: Registry,
	model: string,
	field: SchemaField,
	creating: boolean,
): GraphQLInputType {
	if (field.kind === 'scalar') return scalarType(registry, model, field)
	return relationInput(registry, field.kind, creating)
}

/**
 * `PostCreateInput` and `PostUpdateInput`: every field, those only Master
 * reads included, each optional since a default or a hook may give it; the
 * kernel checks what is missing (D-67).
 */
function dataInput(
	registry: Registry,
	model: string,
	creating: boolean,
): GraphQLInputObjectType {
	const name = `${model}${creating ? 'Create' : 'Update'}Input`
	return registry.input(
		name,
		() =>
			new GraphQLInputObjectType({
				name,
				fields: () => {
					const fields: GraphQLInputFieldConfigMap = {}
					for (const field of registry.entry(model).model.fields) {
						fields[field.name] = {
							type: fieldInput(registry, model, field, creating),
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
	return {
		[`create${name}`]: {
			type: new GraphQLNonNull(type),
			args: { data: data(true) },
			resolve: written(async (args, select, context) =>
				queries.create({ data: objectOf(args['data']), select }, as(context)),
			),
		},
		[`update${name}`]: {
			type: new GraphQLNonNull(type),
			args: { where, data: data(false) },
			resolve: written(async (args, select, context) =>
				queries.update(
					{ where: unique(args), data: objectOf(args['data']), select },
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
