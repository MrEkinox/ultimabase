import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
	UltimaBase,
	databaseAdapterCapability,
	databaseFilterOperatorCapabilityVersion,
	databaseFilterOperatorsCapability,
	databaseInclusionCapability,
	databasePersistencePlanCapability,
	databasePointerCapability,
	databaseRelationCapability,
	databaseRelationPredicateCapability,
	type DatabaseAdapter,
	type DatabaseFilterOperatorCapability,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
} from '@ultimabase/core'
import {
	anonymous,
	contributeOperation,
	defineOperation,
	defineOperationValue,
	plugin,
	provideCapability,
} from '@ultimabase/core/plugin'
import { isInputObjectType, isObjectType, type GraphQLSchema } from 'graphql'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

import { graphqlPlugin, type GraphqlPluginOptions } from '../src/index.js'

const rowId = '01991f00-0000-7000-8000-000000000801'

/** Answers reads from one row and counts with a fixed total. */
class SurfaceDatabase implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly capabilities = {
		inclusions: databaseInclusionCapability,
		persistencePlans: databasePersistencePlanCapability,
		pointers: databasePointerCapability,
		relationPredicates: databaseRelationPredicateCapability,
		relations: databaseRelationCapability,
	}
	readonly operations: string[] = []
	healthy = true

	checkHealth(): Promise<void> {
		return this.healthy
			? Promise.resolve()
			: Promise.reject(new Error('database unavailable'))
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		const { kind } = request.operation
		this.operations.push(kind)
		const values: Readonly<Record<string, unknown>> = {
			id: rowId,
			rank: 1,
			tags: [],
			title: 'Surface',
		}
		const row = Object.fromEntries(
			request.plan.returning.selection.fields.map(({ field }) => [
				field,
				values[field],
			]),
		)
		const result: unknown =
			kind === 'count' ? 3 : kind === 'find-many' ? [row] : row
		return Promise.resolve(result as DatabaseOperationResult<TOperation>)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		return Promise.reject(new TypeError('Surface fixture does not mutate'))
	}
}

const databasePlugin = (
	adapter: DatabaseAdapter,
	operators?: DatabaseFilterOperatorCapability,
) =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.graphql-surface-database',
		version: '1.0.0',
		contributions: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database',
				create: () => ({ value: adapter }),
			}),
			...(operators === undefined
				? []
				: [
						provideCapability(databaseFilterOperatorsCapability, {
							contributionId: 'operators',
							value: operators,
						}),
					]),
		],
	})

const nullValue = defineOperationValue((value): null => {
	if (value !== null && value !== undefined) {
		throw new TypeError('Expected no input')
	}
	return null
})
const ping = defineOperation({
	input: nullValue,
	name: 'fixture.graphql-surface.ping',
	result: nullValue,
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
})
const pingPlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.graphql-surface-operations',
	permissions: {
		'operation:declare': 'Declares the ping operation.',
		'transport:expose': 'Declares it public.',
	},
	version: '1.0.0',
	contributions: [
		contributeOperation({
			execute: () => null,
			operation: ping,
			public: { name: 'ping' },
		}),
	],
})

const App = UltimaBase.use(graphqlPlugin())

const Post = App.Schema.define({
	className: 'SurfacePost',
	fields: (field) => ({
		rank: field.int(),
		tags: field.string({ list: true }),
		title: field.string(),
	}),
}).with((plugins) =>
	plugins.graphql({
		count: true,
		createMany: true,
		findOne: false,
		typeName: 'Article',
	}),
)
const Note = App.Schema.define({
	className: 'SurfaceNote',
	fields: (field) => ({ body: field.string() }),
})
// ADR-0333: hidden schemas, one reached through an exposed relation.
const Audit = App.Schema.define({
	className: 'SurfaceAudit',
	fields: (field) => ({ secretAction: field.string() }),
}).with((plugins) => plugins.graphql(false))
const Keeper = App.Schema.define({
	className: 'SurfaceKeeper',
	fields: (field) => ({ name: field.string() }),
}).with((plugins) => plugins.graphql(false))
const Book = App.Schema.define({
	className: 'SurfaceBook',
	fields: (field) => ({
		keeper: field.pointer({ target: () => Keeper }),
		title: field.string(),
	}),
}).with((plugins) => plugins.graphql(false))
const Shelf = App.Schema.define({
	className: 'SurfaceShelf',
	fields: (field) => ({
		books: field.relation({ target: () => Book }),
		label: field.string(),
	}),
})

const start = async (
	options: GraphqlPluginOptions = {},
	extra: {
		readonly operators?: DatabaseFilterOperatorCapability
		readonly schemas?: readonly (
			| typeof Audit
			| typeof Book
			| typeof Keeper
			| typeof Note
			| typeof Post
			| typeof Shelf
		)[]
		readonly warn?: (message: string) => void
	} = {},
) => {
	const adapter = new SurfaceDatabase()
	const application = new (UltimaBase.use(
		databasePlugin(adapter, extra.operators),
		pingPlugin,
		graphqlPlugin({ publicWrites: true, ...options }),
	))({
		logger: {
			debug: vi.fn(),
			error: vi.fn(),
			info: vi.fn(),
			warn: extra.warn ?? vi.fn(),
		},
		schemas: extra.schemas ?? [Post, Note],
	})
	onTestFinished(() => application.dispose())
	await application.start()
	const graphql = application.plugin('@ultimabase/graphql-plugin')
	const execute = (document: string) =>
		graphql.execute({
			context: anonymous(application, {
				requestId: 'graphql-surface',
				source: 'ultimabase.graphql',
			}).context,
			document,
		})
	return { adapter, application, execute, graphql }
}

const fieldNames = (schema: GraphQLSchema, name: string): string[] => {
	const type = schema.getType(name)
	if (!isObjectType(type) && !isInputObjectType(type)) {
		throw new TypeError(`Missing GraphQL type ${name}`)
	}
	return Object.keys(type.getFields()).sort()
}

describe('GraphQL surface (ADR-0325)', () => {
	it('selects roots by schema method names and names the type', async () => {
		const { graphql } = await start()
		const query = fieldNames(graphql.schema, 'Query')
		const mutation = fieldNames(graphql.schema, 'Mutation')

		expect(query).toEqual(
			expect.arrayContaining([
				'countArticle',
				'existsArticle',
				'findManyArticle',
				'health',
			]),
		)
		expect(query).not.toContain('getArticle')
		expect(query).not.toContain('findOneArticle')
		expect(query).not.toContain('countSurfaceNote')
		expect(mutation).toEqual(
			expect.arrayContaining(['createArticle', 'createManyArticle']),
		)
		expect(mutation).not.toContain('updateManyArticle')
	})

	it('refuses a rule key that names no method or command', async () => {
		const Bogus = App.Schema.define({
			className: 'SurfaceBogus',
			fields: (field) => ({ title: field.string() }),
			// @ts-expect-error -- the type also refuses an unknown command.
		}).with((plugins) => plugins.graphql({ archiveOne: true }))
		const application = new (UltimaBase.use(
			databasePlugin(new SurfaceDatabase()),
			graphqlPlugin({ publicWrites: true }),
		))({ logger: false, schemas: [Bogus] })
		onTestFinished(() => application.dispose())
		await expect(application.start()).rejects.toThrow(
			'graphql.archiveOne on SurfaceBogus names no schema method or exposable command',
		)
	})

	it('names how to enable a disabled feature', async () => {
		const { execute } = await start()

		const disabledRoot = await execute(`{ getArticle(id: "${rowId}") { id } }`)
		expect(disabledRoot.errors?.map((error) => error.message)).toStrictEqual([
			'Cannot query field "getArticle" on type "Query". hint: enable graphql: { findOne: true } on SurfacePost',
		])
		const disabledCount = await execute(
			'{ findManySurfaceNote { totalCount } }',
		)
		expect(disabledCount.errors?.[0]?.message).toBe(
			'Cannot query field "totalCount" on type "SurfaceNoteConnection". hint: enable graphql: { count: true } on SurfaceNote',
		)
		// Any other unknown field keeps GraphQL's own message.
		const unknown = await execute('{ unknownField }')
		expect(unknown.errors?.[0]?.message).toBe(
			'Cannot query field "unknownField" on type "Query".',
		)
	})

	it('counts a root connection only when totalCount is selected', async () => {
		const { adapter, execute } = await start()

		const counted = await execute(
			'{ findManyArticle(first: 1) { totalCount nodes { id } } }',
		)
		expect(counted).toEqual({
			data: { findManyArticle: { nodes: [{ id: rowId }], totalCount: 3 } },
		})
		expect(adapter.operations).toStrictEqual(['find-many', 'count'])

		adapter.operations.length = 0
		await execute('{ findManyArticle(first: 1) { nodes { id } } }')
		expect(adapter.operations).toStrictEqual(['find-many'])
	})

	it('answers the health field without exposed schema', async () => {
		const { adapter, application, execute } = await start()
		expect(await execute('{ health }')).toEqual({ data: { health: 'OK' } })
		adapter.healthy = false
		expect(await execute('{ health }')).toEqual({
			data: { health: 'DEGRADED' },
		})

		await application.dispose()
		const warn = vi.fn()
		const empty = await start(
			{ default: false, hide: [ping] },
			{ schemas: [Note], warn },
		)
		expect(fieldNames(empty.graphql.schema, 'Query')).toStrictEqual(['health'])
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining(
				'GraphQL exposes no schema or operation, only its health field',
			),
		)
	})

	it('lists only the operators the adapter declares', async () => {
		const declared = await start(
			{},
			{
				operators: {
					families: {
						int: [],
						list: ['list-has', 'null'],
						string: ['equal', 'starts-with', 'null'],
						uuid: ['equal', 'in', 'null'],
					},
					kind: 'filter-operators',
					version: databaseFilterOperatorCapabilityVersion,
				},
			},
		)
		const schema = declared.graphql.schema
		expect(fieldNames(schema, 'ArticleTitleWhere')).toStrictEqual([
			'eq',
			'isNotNull',
			'isNull',
			'startsWith',
		])
		expect(fieldNames(schema, 'ArticleTagsWhere')).toStrictEqual([
			'has',
			'isNotNull',
			'isNull',
		])
		// A field without any declared operator leaves the filter input.
		expect(fieldNames(schema, 'ArticleWhere')).not.toContain('rank')
		expect(schema.getType('ArticleRankWhere')).toBeUndefined()

		// Without a static declaration, every operator stays listed.
		await declared.application.dispose()
		const undeclared = await start()
		expect(fieldNames(undeclared.graphql.schema, 'ArticleTitleWhere')).toEqual(
			expect.arrayContaining(['contains', 'endsWith', 'matches', 'ne']),
		)
	})

	it('writes the SDL file at startup', async () => {
		const directory = await mkdtemp(path.join(tmpdir(), 'ultimabase-sdl-'))
		onTestFinished(() => rm(directory, { force: true, recursive: true }))
		const file = path.join(directory, 'schema.graphql')
		const { graphql } = await start({ sdl: file })
		expect(await readFile(file, 'utf8')).toBe(`${graphql.printSchema()}\n`)
	})

	it('exposes public operations and hides the listed ones', async () => {
		const shown = await start()
		expect(fieldNames(shown.graphql.schema, 'Mutation')).toContain('ping')
		expect(await shown.execute('mutation { ping }')).toEqual({
			data: { ping: null },
		})
		await shown.application.dispose()

		const hidden = await start({ hide: [ping] })
		expect(fieldNames(hidden.graphql.schema, 'Mutation')).not.toContain('ping')
		await hidden.application.dispose()

		const application = new (UltimaBase.use(
			databasePlugin(new SurfaceDatabase()),
			graphqlPlugin({ hide: [ping] }),
		))({ logger: false, schemas: [] })
		onTestFinished(() => application.dispose())
		await expect(application.start()).rejects.toThrow(
			'graphqlPlugin({ hide }) lists fixture.graphql-surface.ping, which is not a public operation of this application',
		)
	})
})

const typeNames = (schema: GraphQLSchema): string[] =>
	Object.keys(schema.getTypeMap())

describe('Hidden schemas (ADR-0333)', () => {
	it('leaves out a hidden schema that no exposed schema reaches', async () => {
		const { graphql, execute } = await start({}, { schemas: [Post, Audit] })

		expect(
			typeNames(graphql.schema).filter((name) => name.includes('Audit')),
		).toStrictEqual([])
		const sdl = graphql.printSchema()
		expect(sdl).not.toContain('SurfaceAudit')
		expect(sdl).not.toContain('secretAction')
		expect(await execute('{ __type(name: "SurfaceAudit") { name } }')).toEqual({
			data: { __type: null },
		})
		const introspected = await execute('{ __schema { types { name } } }')
		expect(JSON.stringify(introspected)).not.toContain('SurfaceAudit')
	})

	it('keeps only the types an exposed relation needs', async () => {
		const { graphql } = await start({}, { schemas: [Shelf, Book, Keeper] })
		const names = typeNames(graphql.schema)

		// Reached through `books` and its nested writes, then `keeper`.
		expect(names).toEqual(
			expect.arrayContaining([
				'SurfaceBook',
				'SurfaceBookConnection',
				'SurfaceBookCreateInput',
				'SurfaceBookWhere',
				'SurfaceKeeper',
				'SurfaceKeeperCreateInput',
			]),
		)
		// No relation lists keepers, and neither hidden schema has a root.
		expect(names).not.toContain('SurfaceKeeperConnection')
		expect(names).not.toContain('SurfaceKeeperEdge')
		const roots = [
			...fieldNames(graphql.schema, 'Query'),
			...fieldNames(graphql.schema, 'Mutation'),
		]
		expect(roots.filter((name) => /Book|Keeper/u.test(name))).toStrictEqual([])
	})

	it('names disabled features outside production only', async () => {
		vi.stubEnv('NODE_ENV', 'production')
		onTestFinished(() => {
			vi.unstubAllEnvs()
		})
		const { execute } = await start({}, { schemas: [Post, Note, Audit] })

		for (const document of [
			`{ getArticle(id: "${rowId}") { id } }`,
			'{ findManySurfaceNote { totalCount } }',
			'{ findManySurfaceAudit { nodes { id } } }',
		]) {
			const result = await execute(document)
			const message = result.errors?.[0]?.message ?? ''
			expect(message).toMatch(/^Cannot query field "\w+" on type "\w+"\./u)
			expect(message).not.toContain('hint:')
			expect(message).not.toContain('enable graphql')
		}
	})
})
