import { onTestFinished, describe, expect, it } from 'vitest'
import {
	Schema,
	plugin,
	contributeDeclarations,
	definePluginField,
	definePluginFieldFamily,
} from '@ultimabase/core'
import { initializeGraphqlTestApplication as createApplication } from './application.test-support.js'
import { pgVectorPlugin, vectorField } from '@ultimabase/pg-vector-plugin'
import {
	isEnumType,
	isInputObjectType,
	isObjectType,
	printSchema,
} from 'graphql'

import {
	graphqlPlugin,
	type GraphqlPluginExports,
	type GraphqlSchemaExposureOption,
} from './index.js'

declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedSchemaOptions {
		readonly graphql?: GraphqlSchemaExposureOption
	}
}

const readGraphql = (
	application: Awaited<ReturnType<typeof createApplication>>,
): GraphqlPluginExports =>
	application.plugin('@ultimabase/graphql-plugin') as GraphqlPluginExports

const defineCompleteSchemas = () => {
	const Author = Schema.define({
		className: 'Author',
		fields: (field) => ({
			name: field.string({ required: true }),
			posts: field.relation({ mappedBy: 'author', target: 'Post' }),
		}),
	})
	const Post = Schema.define({
		className: 'Post',
		fields: (field) => ({
			active: field.boolean(),
			attachment: field.binary(),
			author: field.pointer({ target: 'Author' }),
			availableOn: field.date(),
			bigCounter: field.bigint(),
			cutoff: field.time(),
			details: field.object({
				fields: (nested) => ({
					note: nested.string({ required: true }),
					rating: nested.float(),
				}),
				typeName: 'PostDetails',
			}),
			embedding: vectorField({ dimensions: 2 }),
			externalId: field.uuid(),
			metadata: field.json(),
			price: field.decimal(),
			publishedAt: field.dateTime(),
			rating: field.float(),
			status: field.enum({ values: ['draft', 'in-review'] }),
			stock: field.int(),
			tags: field.string({ list: true }),
			title: field.string({ required: true }),
		}),
		graphql: true,
	})
	return { Author, Post }
}

describe('GraphQL structural schema compilation', () => {
	it('compiles every built-in shape, plugin JSON codec, and relationship type', async () => {
		const { Author, Post } = defineCompleteSchemas()
		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [pgVectorPlugin(), graphqlPlugin()],
			schemas: [Author, Post],
		})
		onTestFinished(() => application.dispose())
		const schema = readGraphql(application).schema
		const post = schema.getType('Post')
		const author = schema.getType('Author')
		const create = schema.getType('PostCreateInput')
		const update = schema.getType('PostUpdateInput')
		const flatCreate = schema.getType('PostFlatCreateInput')
		const flatUpdate = schema.getType('PostFlatUpdateInput')
		const authorCreate = schema.getType('PostAuthorNestedCreateInput')
		const authorUpdate = schema.getType('PostAuthorNestedUpdateInput')
		const status = schema.getType('PostStatus')
		const stockUpdate = schema.getType('PostStockUpdate')
		const connection = schema.getType('PostConnection')
		const edge = schema.getType('PostEdge')
		const pageInfo = schema.getType('PageInfo')

		expect(isObjectType(post)).toBe(true)
		expect(isObjectType(author)).toBe(true)
		expect(isInputObjectType(create)).toBe(true)
		expect(isInputObjectType(update)).toBe(true)
		expect(isInputObjectType(flatCreate)).toBe(true)
		expect(isInputObjectType(flatUpdate)).toBe(true)
		expect(isInputObjectType(authorCreate)).toBe(true)
		expect(isInputObjectType(authorUpdate)).toBe(true)
		expect(isEnumType(status)).toBe(true)
		expect(isObjectType(connection)).toBe(true)
		expect(isObjectType(edge)).toBe(true)
		expect(isObjectType(pageInfo)).toBe(true)
		if (!isObjectType(post) || !isObjectType(author)) {
			throw new TypeError('Expected generated model object types')
		}
		if (!isInputObjectType(create) || !isInputObjectType(update)) {
			throw new TypeError('Expected generated mutation input types')
		}

		expect(post.getFields().id?.type.toString()).toBe('ID')
		expect(post.getFields().title?.type.toString()).toBe('String')
		expect(post.getFields().tags?.type.toString()).toBe('[String!]')
		expect(post.getFields().embedding?.type.toString()).toBe('JSON')
		expect(post.getFields().author?.type.toString()).toBe('Author')
		expect(author.getFields().posts?.type.toString()).toBe('PostConnection')
		expect(create.getFields().title?.type.toString()).toBe('String!')
		expect(create.getFields().author?.type.toString()).toBe(
			'PostAuthorNestedCreateInput',
		)
		expect(create.getFields().createdAt).toBeUndefined()
		expect(update.getFields().id).toBeUndefined()
		expect(update.getFields().title?.type.toString()).toBe('PostTitleUpdate')
		if (
			!isInputObjectType(flatCreate) ||
			!isInputObjectType(flatUpdate) ||
			!isInputObjectType(authorCreate) ||
			!isInputObjectType(authorUpdate)
		) {
			throw new TypeError('Expected generated nested mutation input types')
		}
		expect(flatCreate.getFields().author).toBeUndefined()
		expect(flatUpdate.getFields().author).toBeUndefined()
		expect(Object.keys(authorCreate.getFields())).toEqual(['connect', 'create'])
		expect(Object.keys(authorUpdate.getFields())).toEqual([
			'connect',
			'create',
			'update',
			'disconnect',
		])
		expect(isInputObjectType(stockUpdate)).toBe(true)
		expect(
			isInputObjectType(stockUpdate)
				? Object.keys(stockUpdate.getFields())
				: [],
		).toEqual(['set', 'increment', 'decrement'])
		expect(
			schema.getQueryType()?.getFields().getPost?.args[0]?.type.toString(),
		).toBe('ID!')
		expect(
			Object.fromEntries(
				Object.entries(schema.getMutationType()?.getFields() ?? {})
					.filter(([name]) => name.endsWith('Post'))
					.map(([name, field]) => [
						name,
						{
							argument: field.args[0]?.type.toString(),
							result: field.type.toString(),
						},
					]),
			),
		).toStrictEqual({
			createPost: { argument: 'PostCreateInput!', result: 'Post!' },
			createManyPost: { argument: 'PostCreateManyInput!', result: '[Post!]!' },
			updatePost: { argument: 'PostUpdateOneInput!', result: 'Post' },
			updateManyPost: { argument: 'PostUpdateManyInput!', result: '[Post!]!' },
			deletePost: { argument: 'PostDeleteOneInput!', result: 'Post' },
			deleteManyPost: { argument: 'PostDeleteManyInput!', result: '[Post!]!' },
			upsertPost: { argument: 'PostUpsertOneInput!', result: 'Post!' },
			upsertManyPost: { argument: 'PostUpsertManyInput!', result: '[Post!]!' },
		})
		expect(printSchema(schema)).toContain(
			'input PostUpdateOneInput {\n  data: PostUpdateInput!\n  id: ID\n  where: PostWhere\n}',
		)
		expect(printSchema(schema)).toContain(
			'input PostUpsertManyInput {\n  data: [PostUpsertOneInput!]!\n}',
		)
		expect(printSchema(schema)).toContain(
			'input PostCreateManyInput {\n  data: [PostFlatCreateInput!]!\n}',
		)
		expect(printSchema(schema)).toContain('type PostConnection')
		if (
			!isObjectType(connection) ||
			!isObjectType(edge) ||
			!isObjectType(pageInfo)
		) {
			throw new TypeError('Expected generated Relay connection types')
		}
		expect(Object.keys(connection.getFields())).toStrictEqual([
			'edges',
			'nodes',
			'pageInfo',
		])
		expect(Object.keys(edge.getFields())).toStrictEqual(['cursor', 'node'])
		expect(Object.keys(pageInfo.getFields()).sort()).toStrictEqual([
			'endCursor',
			'hasNextPage',
			'hasPreviousPage',
			'startCursor',
		])
		await application.dispose()
	})

	it('builds circular nested inputs lazily and omits injected inverse pointers', async () => {
		const CircularAuthor = Schema.define({
			className: 'CircularAuthor',
			fields: (field) => ({
				name: field.string(),
				posts: field.relation({ mappedBy: 'author', target: 'CircularPost' }),
			}),
			graphql: true,
		})
		const CircularPost = Schema.define({
			className: 'CircularPost',
			fields: (field) => ({
				author: field.pointer({ required: true, target: 'CircularAuthor' }),
				title: field.string(),
			}),
			graphql: true,
		})
		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [graphqlPlugin()],
			schemas: [CircularAuthor, CircularPost],
		})
		onTestFinished(() => application.dispose())
		const schema = readGraphql(application).schema
		const postCreate = schema.getType('CircularPostCreateInput')
		const pointerUpdate = schema.getType('CircularPostAuthorNestedUpdateInput')
		const relationCreateTarget = schema.getType(
			'CircularAuthorPostsNestedCreateTargetInput',
		)
		const relationUpdate = schema.getType(
			'CircularAuthorPostsNestedUpdateInput',
		)

		expect(isInputObjectType(postCreate)).toBe(true)
		expect(isInputObjectType(pointerUpdate)).toBe(true)
		expect(isInputObjectType(relationCreateTarget)).toBe(true)
		expect(isInputObjectType(relationUpdate)).toBe(true)
		if (
			!isInputObjectType(postCreate) ||
			!isInputObjectType(pointerUpdate) ||
			!isInputObjectType(relationCreateTarget) ||
			!isInputObjectType(relationUpdate)
		) {
			throw new TypeError('Expected circular nested input types')
		}
		expect(postCreate.getFields().author?.type.toString()).toBe(
			'CircularPostAuthorNestedCreateInput!',
		)
		expect(pointerUpdate.getFields().disconnect).toBeUndefined()
		expect(Object.keys(relationCreateTarget.getFields())).toEqual(['title'])
		expect(Object.keys(relationUpdate.getFields())).toEqual([
			'create',
			'connect',
			'update',
		])
		expect(printSchema(schema)).toContain('create: CircularAuthorCreateInput')
		await application.dispose()
	})

	it('maps non-GraphQL enum values reversibly without exposing raw invalid names', async () => {
		const Entry = Schema.define({
			className: 'Entry',
			fields: (field) => ({ state: field.enum({ values: ['in-review'] }) }),
		})
		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [graphqlPlugin()],
			schemas: [Entry],
		})
		onTestFinished(() => application.dispose())
		const type = readGraphql(application).schema.getType('EntryState')

		expect(isEnumType(type)).toBe(true)
		if (!isEnumType(type)) throw new TypeError('Expected generated enum')
		const [value] = type.getValues()
		expect(value?.name).toMatch(/^VALUE_[0-9A-F]{64}$/u)
		expect(value?.value).toBe('in-review')
		await application.dispose()
	})

	it('keeps plugin-owned schemas as supporting types without generating CRUD roots', async () => {
		const Post = Schema.define({
			className: 'Post',
			fields: (field) => ({
				audit: field.pointer({ target: 'Audit' }),
				title: field.string(),
			}),
		})
		const Audit = Schema.define({
			className: 'Audit',
			fields: (field) => ({ message: field.string() }),
		})
		const provider = plugin({
			core: '^0.0.0',
			id: 'fixture.audit-schema',
			permissions: { 'schema:declare': 'Adds the audit fixture schema.' },
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.add({ contributionId: 'audit', schema: Audit })

						return undefined
					},
				}),
			],
		})
		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [provider, graphqlPlugin()],
			schemas: [Post],
		})
		onTestFinished(() => application.dispose())
		const schema = readGraphql(application).schema

		expect(schema.getType('Audit')).toBeDefined()
		expect(schema.getQueryType()?.getFields().getPost).toBeDefined()
		expect(schema.getQueryType()?.getFields().getAudit).toBeUndefined()
		expect(schema.getType('AuditCreateInput')).toBeUndefined()
		const auditInput = schema.getType('PostAuditNestedCreateInput')
		expect(isInputObjectType(auditInput)).toBe(true)
		expect(
			isInputObjectType(auditInput) ? Object.keys(auditInput.getFields()) : [],
		).toEqual(['connect'])
		await application.dispose()
	})

	it('rejects every direct graphql occurrence on a plugin-owned schema', async () => {
		const Post = Schema.define({
			className: 'Post',
			fields: (field) => ({ title: field.string() }),
		})
		const Private = Schema.define({
			className: 'PrivateRecord',
			fields: (field) => ({ secret: field.string() }),
			graphql: false,
		})
		const provider = plugin({
			core: '^0.0.0',
			id: 'fixture.private-schema',
			permissions: { 'schema:declare': 'Adds a private fixture schema.' },
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.add({ contributionId: 'private', schema: Private })

						return undefined
					},
				}),
			],
		})

		await expect(
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [provider, graphqlPlugin()],
				schemas: [Post],
			}),
		).rejects.toThrow(
			'Plugin-owned schema PrivateRecord cannot declare the direct graphql option',
		)
	})

	it('rejects private plugin schema options, invalid names, collisions, and missing codecs', async () => {
		const Invalid = Schema.define({
			className: 'Invalid',
			fields: (field) => ({ 'bad-name': field.string() }),
		})
		await expect(
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [graphqlPlugin()],
				schemas: [Invalid],
			}),
		).rejects.toThrow('Invalid GraphQL field name')

		const Collision = Schema.define({
			className: 'SafeInt',
			fields: (field) => ({ value: field.int() }),
		})
		await expect(
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [graphqlPlugin()],
				schemas: [Collision],
			}),
		).rejects.toThrow('conflicts with reserved GraphQL SafeInt')

		const missingField = definePluginField(
			'fixture.missing-codec',
			{},
			{
				snapshotValue: (value: unknown) => value,
			},
		)
		const Missing = Schema.define({
			className: 'Missing',
			fields: () => ({ value: missingField }),
		})
		const fieldType = definePluginFieldFamily({
			fieldKind: 'fixture.missing-codec',
			typegen: { module: '@fixture/missing-codec', valueType: 'MissingValue' },
		})
		const owner = plugin({
			core: '^0.0.0',
			id: 'fixture.missing-codec',
			permissions: { 'schema:declare': 'Declares a codec fixture field.' },
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ fields }) => {
						fields.register(fieldType)
						return undefined
					},
				}),
			],
		})
		await expect(
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [owner, graphqlPlugin()],
				schemas: [Missing],
			}),
		).rejects.toThrow('has no ultimabase.graphql.field@1.0.0 JSON codec')
	})

	it('detects generated type collisions with exact schema provenance', async () => {
		const Post = Schema.define({
			className: 'Post',
			fields: (field) => ({ title: field.string() }),
		})
		const Conflicting = Schema.define({
			className: 'PostCreateInput',
			fields: (field) => ({ value: field.string() }),
		})

		await expect(
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [graphqlPlugin()],
				schemas: [Post, Conflicting],
			}),
		).rejects.toThrow(
			'GraphQL type "PostCreateInput" from schema Post conflicts with schema PostCreateInput',
		)
	})

	it('produces the same schema from repeated isolated compilation', async () => {
		const Repeatable = Schema.define({
			className: 'Repeatable',
			fields: (field) => ({ value: field.string() }),
		})
		const create = () =>
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [graphqlPlugin()],
				schemas: [Repeatable],
			})
		const first = await create()
		const firstSchema = printSchema(readGraphql(first).schema)
		await first.dispose()
		const second = await create()

		expect(printSchema(readGraphql(second).schema)).toBe(firstSchema)
		await second.dispose()
	})

	it('rejects a final graph without a query and releases schema state on disposal', async () => {
		const Hidden = Schema.define({
			className: 'Hidden',
			fields: (field) => ({ value: field.string() }),
		})
		await expect(
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [graphqlPlugin({ default: false })],
				schemas: [Hidden],
			}),
		).rejects.toThrow('requires at least one public query field')

		const Visible = Schema.define({
			className: 'Visible',
			fields: (field) => ({ value: field.string() }),
		})
		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [graphqlPlugin()],
			schemas: [Visible],
		})
		onTestFinished(() => application.dispose())
		const graphql = readGraphql(application)
		expect(graphql.schema.getType('Visible')).toBeDefined()
		await application.dispose()
		expect(() => graphql.schema).toThrow('has been disposed')
	})

	it('rejects duplicate GraphQL owners and isolates sequential applications', async () => {
		const Duplicate = Schema.define({
			className: 'Duplicate',
			fields: (field) => ({ value: field.string() }),
		})
		await expect(
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [graphqlPlugin(), graphqlPlugin()],
				schemas: [Duplicate],
			}),
		).rejects.toThrow()

		const Alpha = Schema.define({
			className: 'Alpha',
			fields: (field) => ({
				next: field.pointer({ target: 'Alpha' }),
				value: field.string(),
			}),
		})
		const Beta = Schema.define({
			className: 'Beta',
			fields: (field) => ({
				next: field.pointer({ target: 'Beta' }),
				value: field.string(),
			}),
		})
		const alpha = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [graphqlPlugin()],
			schemas: [Alpha],
		})
		const alphaSchema = readGraphql(alpha).schema
		await alpha.dispose()
		const beta = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [graphqlPlugin()],
			schemas: [Beta],
		})

		expect(alphaSchema.getType('Beta')).toBeUndefined()
		expect(readGraphql(beta).schema.getType('Alpha')).toBeUndefined()
		expect(alphaSchema.getType('AlphaNextNestedCreateInput')).toBeDefined()
		expect(alphaSchema.getType('BetaNextNestedCreateInput')).toBeUndefined()
		expect(
			readGraphql(beta).schema.getType('BetaNextNestedCreateInput'),
		).toBeDefined()
		expect(
			readGraphql(beta).schema.getType('AlphaNextNestedCreateInput'),
		).toBeUndefined()
		await Promise.all([alpha.dispose(), beta.dispose()])
	})
})
