import {
	UltimaBase,
	defineEnum,
	definePluginOutputDescriptor,
	normalizeReadOperation,
	type ReadOperationAst,
} from '@ultimabase/core'
import { initializeGraphqlTestApplication as createApplication } from './application.test-support.js'
import {
	GraphQLObjectType,
	GraphQLSchema,
	GraphQLString,
	graphql,
	isEnumType,
	isInputObjectType,
	isObjectType,
	type GraphQLResolveInfo,
} from 'graphql'
import { describe, expect, it } from 'vitest'

import { graphqlPlugin } from './index.js'
import { readGraphqlConnectionRuntime } from './application.js'
import { normalizeGraphqlReadOperation } from './read-normalization.test-support.js'
import { graphqlFixtureDatabasePlugin } from './test-application.test-support.js'

// A shared enum names one GraphQL enum type (ADR-0310).
const VirtualStatus = defineEnum('VirtualStatus', ['ready'])

const GraphqlSchemaApplication = UltimaBase.use(graphqlPlugin())

const defineVirtualSchema = () =>
	GraphqlSchemaApplication.Schema.define({
		className: 'GraphqlVirtualShape',
		fields: (field) => ({
			title: field.string(),
			bigCounter: field.virtual({
				output: (output) => output.bigint(),
				resolve: () => 12n,
				select: { id: true },
			}),
			binary: field.virtual({
				output: (output) => output.binary(),
				resolve: () => new Uint8Array([1]),
				select: { id: true },
			}),
			flag: field.virtual({
				output: (output) => output.boolean(),
				resolve: () => true,
				select: { id: true },
			}),
			calendarDate: field.virtual({
				output: (output) => output.date(),
				resolve: () => '2026-09-09',
				select: { id: true },
			}),
			instant: field.virtual({
				output: (output) => output.dateTime(),
				resolve: () => '2026-09-09T20:00:00.000Z',
				select: { id: true },
			}),
			price: field.virtual({
				output: (output) => output.decimal(),
				resolve: () => '12.50',
				select: { id: true },
			}),
			ratio: field.virtual({
				output: (output) => output.float(),
				resolve: () => 1.5,
				select: { id: true },
			}),
			count: field.virtual({
				output: (output) => output.int(),
				resolve: () => 3,
				select: { id: true },
			}),
			metadata: field.virtual({
				output: (output) => output.json(),
				resolve: () => ({ active: true }),
				select: { id: true },
			}),
			status: field.virtual({
				output: (output) => output.enum({ values: VirtualStatus }),
				resolve: () => 'ready',
				select: { id: true },
			}),
			tags: field.virtual({
				output: (output) => output.string({ list: true }),
				resolve: () => ['one'],
				select: { id: true },
			}),
			nickname: field.virtual({
				output: (output) => output.string({ required: false }),
				resolve: () => null,
				select: { id: true },
			}),
			optionalTags: field.virtual({
				output: (output) => output.string({ list: true, required: false }),
				resolve: () => null,
				select: { id: true },
			}),
			clockTime: field.virtual({
				output: (output) => output.time(),
				resolve: () => '20:00:00',
				select: { id: true },
			}),
			externalId: field.virtual({
				output: (output) => output.uuid(),
				resolve: () => '01991f00-0000-7000-8000-000000000701',
				select: { id: true },
			}),
			summary: field.virtual({
				output: (output) =>
					output.object({
						fields: (nested) => ({
							label: nested.string(),
							nested: nested.object({
								fields: (child) => ({ score: child.int() }),
							}),
						}),
						typeName: 'SharedVirtualSummary',
					}),
				resolve: () => ({ label: 'value', nested: { score: 1 } }),
				select: { id: true },
			}),
			repeatedSummary: field.virtual({
				output: (output) =>
					output.object({
						fields: (nested) => ({
							label: nested.string(),
							nested: nested.object({
								fields: (child) => ({ score: child.int() }),
							}),
						}),
						typeName: 'SharedVirtualSummary',
					}),
				resolve: () => ({ label: 'again', nested: { score: 2 } }),
				select: { id: true },
			}),
		}),
	}).with({ graphql: true })

const customSummaryExtension = () =>
	new GraphQLSchema({
		query: new GraphQLObjectType({
			name: 'Query',
			fields: { ping: { type: GraphQLString } },
		}),
		types: [
			new GraphQLObjectType({
				name: 'SharedVirtualSummary',
				fields: { extension: { type: GraphQLString } },
			}),
		],
	})

describe('GraphQL virtual schema compilation', () => {
	it('compiles every built-in output shape and omits virtual inputs', async () => {
		const Virtual = defineVirtualSchema()
		const application = await createApplication({
			logger: false,
			plugins: [
				graphqlPlugin({ default: true, schemas: [customSummaryExtension()] }),
				graphqlFixtureDatabasePlugin,
			],
			schemas: [Virtual],
		})
		const graphql = application.plugin('@ultimabase/graphql-plugin')
		const model = graphql.schema.getType('GraphqlVirtualShape')
		const create = graphql.schema.getType('GraphqlVirtualShapeCreateInput')
		const update = graphql.schema.getType('GraphqlVirtualShapeUpdateInput')
		const flatCreate = graphql.schema.getType(
			'GraphqlVirtualShapeFlatCreateInput',
		)
		const flatUpdate = graphql.schema.getType(
			'GraphqlVirtualShapeFlatUpdateInput',
		)
		const where = graphql.schema.getType('GraphqlVirtualShapeWhere')
		const order = graphql.schema.getType('GraphqlVirtualShapeOrderField')
		const summary = graphql.schema.getType('SharedVirtualSummary')

		expect(isObjectType(model)).toBe(true)
		expect(isInputObjectType(create)).toBe(true)
		expect(isInputObjectType(update)).toBe(true)
		expect(isInputObjectType(flatCreate)).toBe(true)
		expect(isInputObjectType(flatUpdate)).toBe(true)
		expect(isInputObjectType(where)).toBe(true)
		expect(isEnumType(order)).toBe(true)
		expect(isObjectType(summary)).toBe(true)
		if (!isObjectType(model) || !isObjectType(summary)) {
			throw new TypeError('Expected virtual output object types')
		}
		// ADR-0340: outputs are non-null unless they declare `required: false`.
		expect(
			Object.fromEntries(
				Object.entries(model.getFields()).map(([name, field]) => [
					name,
					field.type.toString(),
				]),
			),
		).toMatchObject({
			bigCounter: 'BigInt!',
			binary: 'Base64!',
			calendarDate: 'Date!',
			clockTime: 'Time!',
			count: 'SafeInt!',
			externalId: 'UUID!',
			flag: 'Boolean!',
			instant: 'DateTime!',
			metadata: 'JSON!',
			nickname: 'String',
			optionalTags: '[String!]',
			price: 'Decimal!',
			ratio: 'Float!',
			repeatedSummary: 'SharedVirtualSummary!',
			status: 'VirtualStatus!',
			summary: 'SharedVirtualSummary!',
			tags: '[String!]!',
		})
		expect(Object.keys(summary.getFields())).toStrictEqual([
			'label',
			'nested',
			'extension',
		])
		for (const type of [create, update, flatCreate, flatUpdate, where]) {
			if (!isInputObjectType(type)) throw new TypeError('Expected input type')
			expect(type.getFields()).not.toHaveProperty('summary')
			expect(type.getFields()).not.toHaveProperty('status')
		}
		if (!isEnumType(order)) throw new TypeError('Expected order enum')
		expect(order.getValues().map(({ name }) => name)).not.toContain('summary')
		await application.dispose()
	})

	it('rejects incompatible repeated output object definitions', async () => {
		const Invalid = GraphqlSchemaApplication.Schema.define({
			className: 'InvalidVirtualShape',
			fields: (field) => ({
				first: field.virtual({
					output: (output) =>
						output.object({
							fields: (nested) => ({ label: nested.string() }),
							typeName: 'ConflictingSummary',
						}),
					resolve: () => ({ label: 'value' }),
					select: { id: true },
				}),
				second: field.virtual({
					output: (output) =>
						output.object({
							fields: (nested) => ({ label: nested.int() }),
							typeName: 'ConflictingSummary',
						}),
					resolve: () => ({ label: 1 }),
					select: { id: true },
				}),
			}),
		})

		await expect(
			createApplication({
				logger: false,
				plugins: [graphqlPlugin(), graphqlFixtureDatabasePlugin],
				schemas: [Invalid],
			}),
		).rejects.toThrow('ConflictingSummary')
	})

	it('normalizes a virtual selection into the ordinary Core logical AST', async () => {
		const Virtual = defineVirtualSchema()
		const application = await createApplication({
			logger: false,
			plugins: [graphqlPlugin(), graphqlFixtureDatabasePlugin],
			schemas: [Virtual],
		})
		const graphqlApplication = application.plugin('@ultimabase/graphql-plugin')
		const root = graphqlApplication.schema
			.getQueryType()
			?.getFields().findOneGraphqlVirtualShape
		if (root === undefined) throw new TypeError('Expected virtual read root')
		root.resolve = undefined
		let normalized: ReadOperationAst | undefined
		const result = await graphql({
			schema: graphqlApplication.schema,
			source:
				'{ findOneGraphqlVirtualShape { summary { label nested { score } } } }',
			rootValue: {
				findOneGraphqlVirtualShape: (
					args: unknown,
					_context: unknown,
					info: GraphQLResolveInfo,
				) => {
					normalized = normalizeGraphqlReadOperation(
						Virtual,
						'findOne',
						args,
						info,
						{
							connections: readGraphqlConnectionRuntime(graphqlApplication),
						},
					)
					return null
				},
			},
		})

		expect(result.errors).toBeUndefined()
		expect(normalized).toStrictEqual(
			normalizeReadOperation(Virtual, 'find-one', {
				select: { summary: true },
			}),
		)
		await application.dispose()
	})

	it('retains custom-schema collision rules for named virtual objects', async () => {
		const custom = new GraphQLSchema({
			query: new GraphQLObjectType({
				name: 'Query',
				fields: { ping: { type: GraphQLString } },
			}),
			types: [
				new GraphQLObjectType({
					name: 'SharedVirtualSummary',
					fields: { label: { type: GraphQLString } },
				}),
			],
		})

		await expect(
			createApplication({
				logger: false,
				plugins: [
					graphqlPlugin({ schemas: [custom] }),
					graphqlFixtureDatabasePlugin,
				],
				schemas: [defineVirtualSchema()],
			}),
		).rejects.toThrow('SharedVirtualSummary.label')
	})

	it('rejects plugin output kinds without an exact GraphQL representation', async () => {
		const output = definePluginOutputDescriptor(
			'fixture.graphql-output',
			{ list: false, required: true },
			(value): string => String(value),
		)
		const Invalid = GraphqlSchemaApplication.Schema.define({
			className: 'UnsupportedGraphqlVirtual',
			fields: (field) => ({
				value: field.virtual({
					output: () => output,
					resolve: () => 'value',
					select: { id: true },
				}),
			}),
		})

		await expect(
			createApplication({
				logger: false,
				plugins: [graphqlPlugin(), graphqlFixtureDatabasePlugin],
				schemas: [Invalid],
			}),
		).rejects.toThrow('without an exact GraphQL v1 representation')
	})
})
