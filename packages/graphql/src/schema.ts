// The schema (D-107): for each visible model, `post(where)` and `posts(...)`,
// each read in one kernel query as its caller.
import type { GraphQLFieldConfig, GraphQLResolveInfo } from 'graphql'
import {
	GraphQLList,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLSchema,
} from 'graphql'
import { uniqueInput, uniqueWhere } from './inputs.ts'
import { connectionType, isMaster, listArgs, objectType } from './outputs.ts'
import { connection, listRead, rowsOf } from './pages.ts'
import type { Args, Context, Entry, Registry } from './registry.ts'
import { grouped, selectOf } from './select.ts'
import { run } from './errors.ts'

type Fields = { [field: string]: GraphQLFieldConfig<unknown, Context, Args> }

const as = (context: Context) => ({ as: context.caller })

const objectOf = (value: unknown): Args =>
	typeof value === 'object' && value !== null ? { ...value } : {}

const whereOf = (args: Args): Args => {
	const { where } = args
	return typeof where === 'object' && where !== null ? { where } : {}
}

/** What a root list selects of its rows: under `edges { node }`. */
function rowNodes(registry: Registry, info: GraphQLResolveInfo) {
	if (registry.settings.pagination === 'list') return info.fieldNodes
	const edges = grouped(info, info.fieldNodes).get('edges') ?? []
	return grouped(info, edges).get('node') ?? []
}

function rootFields(registry: Registry, entry: Entry): Fields {
	const name = entry.model.name
	const type = objectType(registry, name)
	const { queries } = entry.exposed
	const list =
		registry.settings.pagination === 'list'
			? new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(type)))
			: new GraphQLNonNull(
					connectionType(registry, `${name}Connection`, name, true),
				)
	return {
		[entry.single]: {
			type,
			args: {
				where: { type: new GraphQLNonNull(uniqueInput(registry, name)) },
			},
			resolve: async (_, args, context, info) => {
				const where = uniqueWhere(registry, name, objectOf(args['where']))
				const select = selectOf(
					registry,
					info,
					type,
					info.fieldNodes,
					isMaster(context),
				)
				return run(() => queries.findUnique({ where, select }, as(context)))
			},
		},
		[entry.list]: {
			type: list,
			args: listArgs(registry, name),
			resolve: async (_, args, context, info) => {
				const master = isMaster(context)
				const { read, page } = listRead(
					registry.settings.pagination,
					entry,
					args,
					master,
				)
				const select = selectOf(
					registry,
					info,
					type,
					rowNodes(registry, info),
					master,
				)
				const rows = await run(() =>
					queries.findMany({ ...read, select }, as(context)),
				)
				if (page === undefined) return rows
				return {
					...connection(rowsOf(rows), page),
					// Called by the default resolver, so counted only when selected.
					totalCount: () =>
						run(() => queries.count(whereOf(args), as(context))),
				}
			},
		},
	}
}

/** Refuses two models whose root fields share a name. */
export function schemaOf(registry: Registry): GraphQLSchema {
	const fields: Fields = {}
	for (const entry of registry.entries.values()) {
		if (!entry.visible) continue
		for (const [name, field] of Object.entries(rootFields(registry, entry))) {
			if (name in fields) {
				throw new Error(
					`${entry.model.name}: the root field ${name} is another model's; set .with({ graphql: { plural } }).`,
				)
			}
			fields[name] = field
		}
	}
	if (Object.keys(fields).length === 0) {
		throw new Error(
			'graphqlPlugin: no model to expose; each one has .with({ graphql: false }).',
		)
	}
	return new GraphQLSchema({
		query: new GraphQLObjectType({ name: 'Query', fields }),
	})
}
