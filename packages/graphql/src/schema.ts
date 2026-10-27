// The schema (D-107): for each visible model, `post(where)` and `posts(...)`,
// each read in one kernel query as its caller, and its mutations.
import type { GraphQLFieldConfig, GraphQLResolveInfo } from 'graphql'
import {
	GraphQLList,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLSchema,
} from 'graphql'
import { objectOf, uniqueInput, uniqueWhere } from './inputs.ts'
import { connectionType, isMaster, listArgs, objectType } from './outputs.ts'
import { connection, listRead, rowsOf } from './pages.ts'
import { plainWhere } from './json-fields.ts'
import type { Args, Context, Entry, Registry } from './registry.ts'
import { as } from './registry.ts'
import { grouped, selectOf } from './select.ts'
import { mutationFields } from './mutations.ts'
import { run } from './errors.ts'
import type { RootField } from './functions.ts'
import { Refused } from 'ultimabase'

type Fields = { [field: string]: GraphQLFieldConfig<unknown, Context, Args> }

const whereOf = (registry: Registry, model: string, args: Args): Args => {
	const { where } = args
	return typeof where === 'object' && where !== null
		? { where: plainWhere(registry, model, { ...where }) }
		: {}
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
			: new GraphQLNonNull(connectionType(registry, `${name}Connection`, name))
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
				const { read, page } = listRead(registry, entry, args, master)
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
				let counted: Promise<unknown> | undefined
				return {
					...connection(rowsOf(rows), page),
					// Called by the default resolver, so counted only when selected,
					// and once however many aliases ask.
					totalCount: async () => {
						counted ??= run(() =>
							queries.count(whereOf(registry, name, args), as(context)),
						)
						return counted
					},
				}
			},
		},
	}
}

const taken = (name: string, owner: string): Error =>
	new Refused(`${owner}: the type ${name} is a generated type's name.`)

/** The models' types, a json field's among them, built once to name them. */
function generatedTypes(
	fields: Fields,
	mutations: Fields,
	typeOwners: ReadonlyMap<string, string>,
): ReturnType<GraphQLSchema['getTypeMap']> {
	try {
		return new GraphQLSchema({
			query: new GraphQLObjectType({ name: 'Query', fields: { ...fields } }),
			mutation: new GraphQLObjectType({
				name: 'Mutation',
				fields: { ...mutations },
			}),
		}).getTypeMap()
	} catch (error) {
		// A json field's type named like a model's, as `PostStatus`.
		const name = /multiple types named "(\w+)"/.exec(String(error))?.[1]
		const owner = name === undefined ? undefined : typeOwners.get(name)
		if (name === undefined || owner === undefined) throw error
		throw taken(name, owner)
	}
}

/** Refuses two root fields of one name, naming both owners. */
export function schemaOf(
	registry: Registry,
	functions: readonly RootField[],
	typeOwners: ReadonlyMap<string, string>,
): GraphQLSchema {
	const roots = {
		query: new Map<string, string>(),
		mutation: new Map<string, string>(),
	}
	const fields: Fields = {}
	const mutations: Fields = {}
	const add = (
		into: Fields,
		owners: Map<string, string>,
		owner: string,
		hint: string,
		added: Fields,
	) => {
		for (const [name, field] of Object.entries(added)) {
			const other = owners.get(name)
			if (other !== undefined) {
				throw new Refused(
					`${owner}: the root field ${name} is ${other}'s; set .with({ graphql: { ${hint} } }).`,
				)
			}
			owners.set(name, owner)
			into[name] = field
		}
	}
	for (const entry of registry.entries.values()) {
		if (!entry.visible) continue
		const owner = entry.model.name
		add(
			mutations,
			roots.mutation,
			owner,
			'plural',
			mutationFields(registry, entry),
		)
		add(fields, roots.query, owner, 'plural', rootFields(registry, entry))
	}
	// The models' types, which no function's or field's type may be named like.
	const generated = generatedTypes(fields, mutations, typeOwners)
	for (const [name, owner] of typeOwners) {
		if (name in generated && generated[name] !== registry.data.named(name)) {
			throw taken(name, owner)
		}
	}
	for (const { query, name, owner, field } of functions) {
		const [into, owners] = query
			? [fields, roots.query]
			: [mutations, roots.mutation]
		add(into, owners, owner, 'name', { [name]: field })
	}
	if (Object.keys(fields).length === 0) {
		throw new Refused(
			'graphqlPlugin: no query to expose; each model has .with({ graphql: false }) and no function is a query.',
		)
	}
	return new GraphQLSchema({
		query: new GraphQLObjectType({ name: 'Query', fields }),
		mutation:
			Object.keys(mutations).length === 0
				? undefined
				: new GraphQLObjectType({ name: 'Mutation', fields: mutations }),
	})
}
