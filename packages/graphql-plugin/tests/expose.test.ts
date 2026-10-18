import { UltimaBase, dateTimeField } from '@ultimabase/core'
import { command, definePlugin, feature } from '@ultimabase/plugin-kit'
import { isObjectType, type GraphQLSchema } from 'graphql'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

import { graphqlPlugin, type GraphqlPluginOptions } from '../src/index.js'
import {
	ScriptedTestDatabase,
	testDatabasePlugin,
} from '../../../tooling/vitest/test-database.js'

// ADR-0347: GraphQL serves what Core's exposure plan decides.
const databasePlugin = testDatabasePlugin(
	new ScriptedTestDatabase({ description: 'GraphQL expose fixture' }),
	{ id: 'fixture.graphql-expose.database' },
)

const archivePlugin = () =>
	definePlugin({
		name: '@fixture/graphql-expose-archive',
		features: {
			archivable: feature({
				fields: { archivedAt: dateTimeField() },
				commands: {
					archiveOne: command({
						authority: 'request',
						effect: 'update',
						data: () => ({ archivedAt: new Date().toISOString() }),
					}),
					archiveMany: command({
						authority: 'request',
						effect: 'update',
						target: 'many',
						data: () => ({ archivedAt: new Date().toISOString() }),
					}),
				},
			}),
		},
	})

const App = UltimaBase.use(archivePlugin()).use(graphqlPlugin())

const schema = (className: string) =>
	App.Schema.define({
		className,
		fields: (field) => ({ title: field.string() }),
		archivable: true,
	})

const ExposeCount = schema('GqlExposeCount').with({ expose: { count: true } })
const ExposeReadOnly = schema('GqlExposeReadOnly').with({
	expose: { write: false },
})
const ExposeHidden = schema('GqlExposeHidden').with({ expose: false })
// The transport key wins over `expose`, even when it is less precise.
const GraphqlWins = schema('GqlWinsOverExpose').with({
	expose: { count: true, archive: true },
	graphql: { read: false },
})
const GraphqlCreate = schema('GqlCreateDespiteExpose').with({
	expose: { write: false },
	graphql: { createOne: true },
})
const GraphqlOperation = schema('GqlOperationKey').with({
	graphql: { archive: true, find: false },
})
const GraphqlShown = schema('GqlShownDespiteExpose').with({
	expose: false,
	graphql: { findMany: true },
})
const GraphqlHidden = schema('GqlHiddenDespiteExpose').with({
	expose: true,
	graphql: false,
})

const start = async (
	options: GraphqlPluginOptions = {},
	warn: (line: string) => void = vi.fn(),
) => {
	const ultimabase = new (UltimaBase.use(
		databasePlugin,
		archivePlugin(),
		graphqlPlugin({ publicWrites: true, ...options }),
	))({
		logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn },
		schemas: [
			ExposeCount,
			ExposeReadOnly,
			ExposeHidden,
			GraphqlWins,
			GraphqlCreate,
			GraphqlOperation,
			GraphqlShown,
			GraphqlHidden,
		],
	})
	onTestFinished(() => ultimabase.dispose())
	await ultimabase.start()
	const { schema: graphql } = ultimabase.plugin('@ultimabase/graphql-plugin')
	return {
		mutations: (className: string) => roots(graphql, 'Mutation', className),
		queries: (className: string) => roots(graphql, 'Query', className),
	}
}

/** The root fields of one schema, by root type, sorted. */
const roots = (
	graphql: GraphQLSchema,
	type: 'Mutation' | 'Query',
	className: string,
): string[] => {
	const root = graphql.getType(type)
	if (!isObjectType(root)) return []
	return Object.keys(root.getFields())
		.filter((name) => name.endsWith(className))
		.sort()
}

describe('GraphQL reads the exposure plan (ADR-0347)', () => {
	it('applies expose to every method it decides', async () => {
		const { mutations, queries } = await start()
		expect(queries('GqlExposeCount')).toStrictEqual([
			'countGqlExposeCount',
			'existsGqlExposeCount',
			'findManyGqlExposeCount',
			'findOneGqlExposeCount',
		])
		expect(mutations('GqlExposeCount')).toStrictEqual([
			'createGqlExposeCount',
			'deleteGqlExposeCount',
			'updateGqlExposeCount',
		])
		expect(queries('GqlExposeReadOnly')).toStrictEqual([
			'existsGqlExposeReadOnly',
			'findManyGqlExposeReadOnly',
			'findOneGqlExposeReadOnly',
		])
		expect(mutations('GqlExposeReadOnly')).toStrictEqual([])
		expect(queries('GqlExposeHidden')).toStrictEqual([])
		expect(mutations('GqlExposeHidden')).toStrictEqual([])
	})

	it('lets the graphql key win over expose at any level', async () => {
		const { mutations, queries } = await start()
		expect(mutations('GqlCreateDespiteExpose')).toStrictEqual([
			'createGqlCreateDespiteExpose',
		])
		expect(queries('GqlWinsOverExpose')).toStrictEqual([])
		expect(mutations('GqlWinsOverExpose')).toStrictEqual([
			'archiveOneGqlWinsOverExpose',
			'createGqlWinsOverExpose',
			'deleteGqlWinsOverExpose',
			'updateGqlWinsOverExpose',
		])
		expect(queries('GqlShownDespiteExpose')).toStrictEqual([
			'findManyGqlShownDespiteExpose',
		])
		expect(mutations('GqlShownDespiteExpose')).toStrictEqual([])
		// `graphql: false` still hides the schema from GraphQL.
		expect(queries('GqlHiddenDespiteExpose')).toStrictEqual([])
		expect(mutations('GqlHiddenDespiteExpose')).toStrictEqual([])
	})

	it('publishes the One method of an operation key, never the Many one', async () => {
		const { mutations, queries } = await start()
		expect(mutations('GqlOperationKey')).toContain('archiveOneGqlOperationKey')
		expect(mutations('GqlOperationKey')).not.toContain(
			'archiveManyGqlOperationKey',
		)
		expect(queries('GqlOperationKey')).toStrictEqual(['existsGqlOperationKey'])
	})

	it('takes group keys in graphqlPlugin({ default })', async () => {
		const { mutations, queries } = await start({
			default: { count: false, write: false },
		})
		// `expose` and the graphql key decide before the default.
		expect(queries('GqlExposeCount')).toContain('countGqlExposeCount')
		expect(mutations('GqlOperationKey')).toStrictEqual([
			'archiveOneGqlOperationKey',
		])
		expect(mutations('GqlExposeCount')).toStrictEqual([])
	})

	it('silences the expose warning when GraphQL is the only transport', async () => {
		const warn = vi.fn()
		await start({}, warn)
		expect(
			warn.mock.calls.filter(([line]) => String(line).includes('expose')),
		).toStrictEqual([])
	})
})
