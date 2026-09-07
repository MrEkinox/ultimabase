import {
	Schema,
	createApplication,
	definePlugin,
	definePluginField,
	definePluginFieldType,
	normalizeReadOperation,
	type ReadOperationAst,
} from '@ultimabase/core'
import { graphql, type GraphQLResolveInfo } from 'graphql'
import { describe, expect, it } from 'vitest'

import {
	graphqlFieldProtocol,
	graphqlPlugin,
	type GraphqlSchemaExposureOption,
} from './index.js'
import { readGraphqlConnectionRuntime } from './application.js'
import {
	normalizeGraphqlCollectionArguments,
	normalizeGraphqlReadOperation,
} from './read-normalization.js'

declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedSchemaOptions {
		readonly graphql?: GraphqlSchemaExposureOption
	}
}

const authorId = '01991f00-0000-7000-8000-000000000001'

const portableCode = definePluginField(
	'fixture.graphql-code',
	{},
	{
		snapshotValue: (value, path): string => {
			if (typeof value !== 'string' || value !== value.toUpperCase()) {
				throw new TypeError(`${path} must be an uppercase code`)
			}
			return value
		},
		storageCodec: {
			decode: (value): string => {
				if (!value || typeof value !== 'object' || !('stored' in value)) {
					throw new TypeError('stored code must be an object')
				}
				const stored: unknown = value.stored
				if (typeof stored !== 'string') {
					throw new TypeError('stored code must contain a string')
				}
				return stored
			},
			encode: (value) => ({ stored: value }),
			format: 'json',
			version: 1,
		},
		wireCodecs: [
			{
				decode: (value): string => {
					if (!value || typeof value !== 'object' || !('code' in value)) {
						throw new TypeError('GraphQL code must be an object')
					}
					const code: unknown = value.code
					if (typeof code !== 'string') {
						throw new TypeError('GraphQL code must contain a string')
					}
					return code.toUpperCase()
				},
				encode: (value) => ({ code: value.toLowerCase() }),
				format: 'json',
				protocol: graphqlFieldProtocol,
			},
		],
	},
)

const Author = Schema.define({
	className: 'GraphqlReadAuthor',
	fields: (field) => ({ name: field.string() }),
})
const RecordSchema = Schema.define({
	className: 'GraphqlReadRecord',
	fields: (field) => ({
		author: field.pointer({ target: 'GraphqlReadAuthor' }),
		blob: field.binary(),
		huge: field.bigint(),
		name: field.string(),
		payload: field.object({
			fields: (nested) => ({ nestedHuge: nested.bigint() }),
		}),
		portableCode,
		related: field.relation({ target: 'GraphqlReadAuthor' }),
	}),
	graphql: { operations: { count: true } },
})

const fieldOwner = definePlugin({
	core: '^0.0.0',
	pluginId: 'fixture.graphql-code',
	privileges: [
		{ name: 'schema:declare', reason: 'Declares the portable code field.' },
	] as const,
	version: '1.0.0',
	declare: ({ fields }) => {
		fields.declareType(
			definePluginFieldType({
				fieldKind: 'fixture.graphql-code',
				typegen: {
					module: '@fixture/graphql-code',
					valueType: 'PortableCode',
				},
			}),
		)
	},
})

const createFixture = async () => {
	const application = await createApplication({
		pluginPrivileges: { logger: false },
		plugins: [fieldOwner, graphqlPlugin()],
		schemas: [Author, RecordSchema],
	})
	const graphqlApplication = application.getPlugin('@ultimabase/graphql-plugin')
	return {
		application,
		connections: readGraphqlConnectionRuntime(graphqlApplication),
		schema: graphqlApplication.schema,
	}
}

describe('GraphQL read normalization', () => {
	it('matches direct Core ASTs across wire values, fragments, directives, aliases, and inclusions', async () => {
		const { application, connections, schema } = await createFixture()
		let normalized: ReadOperationAst | undefined
		const result = await graphql({
			schema,
			source: `
				query Read($withAuthor: Boolean!) {
					findManyGraphqlReadRecord(
						first: 20
						orderBy: [
							{ field: createdAt, direction: DESC }
							{ field: name, direction: ASC }
						]
						where: {
							author: { eq: "${authorId}" }
							blob: { eq: "AQID" }
							huge: { eq: "9007199254740993" }
							payload: { contains: { nestedHuge: "7" } }
							portableCode: { eq: { code: "blue" } }
							related: { some: { name: { startsWith: "B" } } }
						}
					) {
						nodes {
							label: name
							author @include(if: $withAuthor) { name }
							...RecordFields
							related(first: 5, where: { name: { startsWith: "R" } }) {
								nodes { name }
							}
						}
						edges { node { name } }
					}
				}
				fragment RecordFields on GraphqlReadRecord {
					huge
					portableCode
				}
			`,
			variableValues: { withAuthor: true },
			rootValue: {
				findManyGraphqlReadRecord: (
					args: unknown,
					_context: unknown,
					info: GraphQLResolveInfo,
				) => {
					normalized = normalizeGraphqlReadOperation(
						RecordSchema,
						'findMany',
						args,
						info,
						{ connections },
					)
					return {
						edges: [],
						nodes: [],
						pageInfo: {
							endCursor: null,
							hasNextPage: false,
							hasPreviousPage: false,
							startCursor: null,
						},
					}
				},
			},
		})
		const direct = normalizeReadOperation(RecordSchema, 'find-many', {
			include: {
				author: { select: { name: true } },
				related: {
					limit: 6,
					orderBy: { id: 'asc' },
					select: { name: true },
					where: { name: { startsWith: 'R' } },
				},
			},
			limit: 21,
			orderBy: { createdAt: 'desc', name: 'asc', id: 'asc' },
			select: { name: true, huge: true, portableCode: true },
			where: {
				author: { eq: authorId },
				blob: { eq: Uint8Array.from([1, 2, 3]) },
				huge: { eq: 9_007_199_254_740_993n },
				payload: { contains: { nestedHuge: 7n } },
				portableCode: { eq: 'BLUE' },
				related: { some: { name: { startsWith: 'B' } } },
			},
		})

		expect(result.errors).toBeUndefined()
		expect(normalized).toStrictEqual(direct)
		expect(Object.isFrozen(normalized)).toBe(true)
		expect(
			JSON.stringify(normalized, (_key, value: unknown) =>
				typeof value === 'bigint' ? value.toString() : value,
			),
		).not.toMatch(/document|fragment|resolver|variable|http|authority/iu)
		await application.dispose()
	})

	it('normalizes every singular and aggregate read into its Core operation', async () => {
		const { application, connections, schema } = await createFixture()
		const normalized = new Map<string, ReadOperationAst>()
		const capture =
			(operation: 'count' | 'exists' | 'findOne' | 'get', result: unknown) =>
			(args: unknown, _context: unknown, info: GraphQLResolveInfo): unknown => {
				normalized.set(
					operation,
					normalizeGraphqlReadOperation(RecordSchema, operation, args, info, {
						connections,
					}),
				)
				return result
			}
		const result = await graphql({
			schema,
			source: `
				{
					getGraphqlReadRecord(id: "${authorId}") { name }
					findOneGraphqlReadRecord(where: { name: { eq: "first" } }) { name }
					countGraphqlReadRecord(where: { name: { eq: "counted" } })
					existsGraphqlReadRecord(where: { name: { eq: "existing" } })
				}
			`,
			rootValue: {
				countGraphqlReadRecord: capture('count', 0),
				existsGraphqlReadRecord: capture('exists', true),
				findOneGraphqlReadRecord: capture('findOne', null),
				getGraphqlReadRecord: capture('get', null),
			},
		})

		expect(result.errors).toBeUndefined()
		expect(normalized.get('get')).toStrictEqual(
			normalizeReadOperation(RecordSchema, 'get', {
				id: authorId,
				select: { name: true },
			}),
		)
		expect(normalized.get('findOne')).toStrictEqual(
			normalizeReadOperation(RecordSchema, 'find-one', {
				select: { name: true },
				where: { name: { eq: 'first' } },
			}),
		)
		expect(normalized.get('count')).toStrictEqual(
			normalizeReadOperation(RecordSchema, 'count', {
				where: { name: { eq: 'counted' } },
			}),
		)
		expect(normalized.get('exists')).toStrictEqual(
			normalizeReadOperation(RecordSchema, 'exists', {
				where: { name: { eq: 'existing' } },
			}),
		)
		await application.dispose()
	})

	it('lets GraphQL validation reject unknown and contradictory selections before normalization', async () => {
		const { application, schema } = await createFixture()
		let called = false
		const rootValue = {
			findManyGraphqlReadRecord: () => {
				called = true
				return undefined
			},
		}
		const unknown = await graphql({
			rootValue,
			schema,
			source:
				'{ findManyGraphqlReadRecord(where: { name: { invented: "x" } }) { nodes { name } } }',
		})
		const contradictory = await graphql({
			rootValue,
			schema,
			source:
				'{ findManyGraphqlReadRecord { nodes { value: name value: huge } } }',
		})

		expect(unknown.errors?.[0]?.message).toContain('invented')
		expect(contradictory.errors?.[0]?.message).toContain('conflict')
		expect(called).toBe(false)
		await application.dispose()
	})

	it('rejects malformed and excessive inputs through deterministic pre-Runtime boundaries', async () => {
		const { application, connections } = await createFixture()
		const malformedCollections: readonly Readonly<Record<string, unknown>>[] = [
			{ unknown: true },
			{ first: -1 },
			{ first: 101 },
			{
				orderBy: [
					{ direction: 'asc', field: 'name' },
					{ direction: 'desc', field: 'name' },
				],
			},
		]

		for (const input of malformedCollections) {
			expect(() =>
				normalizeGraphqlCollectionArguments(RecordSchema, input, connections, {
					relationPath: [],
					typeName: 'GraphqlReadRecord',
				}),
			).toThrow()
		}
		for (const where of [
			{ missing: { eq: 1 } },
			{ huge: { eq: 'not-an-integer' } },
			{ portableCode: { eq: { invalid: true } } },
		]) {
			expect(() =>
				normalizeGraphqlReadOperation(
					RecordSchema,
					'count',
					{ where },
					undefined,
					{ connections },
				),
			).toThrow()
		}

		for (let index = 0; index < 32; index += 1) {
			expect(() =>
				normalizeGraphqlReadOperation(
					RecordSchema,
					'count',
					{ where: { [`unknown_${String(index)}`]: { eq: index } } },
					undefined,
					{ connections },
				),
			).toThrow()
		}
		await application.dispose()
	})

	it('rejects relationship aliases that cannot share one Core inclusion', async () => {
		const { application, connections, schema } = await createFixture()
		const result = await graphql({
			schema,
			source: `
				{
					findManyGraphqlReadRecord {
						nodes {
							first: related(first: 1) { nodes { name } }
							second: related(first: 2) { nodes { id } }
						}
					}
				}
			`,
			rootValue: {
				findManyGraphqlReadRecord: (
					args: unknown,
					_context: unknown,
					info: GraphQLResolveInfo,
				) =>
					normalizeGraphqlReadOperation(RecordSchema, 'findMany', args, info, {
						connections,
					}),
			},
		})

		expect(result.errors?.[0]?.message).toContain(
			'cannot use multiple response names',
		)
		await application.dispose()
	})
})
