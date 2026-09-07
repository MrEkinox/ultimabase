import {
	Schema,
	createApplication,
	definePlugin,
	definePluginField,
	definePluginFieldType,
} from '@ultimabase/core'
import { pgVectorPlugin, vectorField } from '@ultimabase/pg-vector-plugin'
import {
	isEnumType,
	isInputObjectType,
	isObjectType,
	printSchema,
} from 'graphql'
import { describe, expect, it } from 'vitest'

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
	application.getPlugin('@ultimabase/graphql-plugin') as GraphqlPluginExports

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
		const schema = readGraphql(application).schema
		const post = schema.getType('Post')
		const author = schema.getType('Author')
		const create = schema.getType('PostCreateInput')
		const update = schema.getType('PostUpdateInput')
		const status = schema.getType('PostStatus')
		const stockUpdate = schema.getType('PostStockUpdate')

		expect(isObjectType(post)).toBe(true)
		expect(isObjectType(author)).toBe(true)
		expect(isInputObjectType(create)).toBe(true)
		expect(isInputObjectType(update)).toBe(true)
		expect(isEnumType(status)).toBe(true)
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
		expect(create.getFields().author?.type.toString()).toBe('ID')
		expect(create.getFields().createdAt).toBeUndefined()
		expect(update.getFields().id).toBeUndefined()
		expect(update.getFields().title?.type.toString()).toBe('PostTitleUpdate')
		expect(isInputObjectType(stockUpdate)).toBe(true)
		expect(
			isInputObjectType(stockUpdate)
				? Object.keys(stockUpdate.getFields())
				: [],
		).toEqual(['set', 'increment', 'decrement'])
		expect(
			schema.getQueryType()?.getFields().getPost?.args[0]?.type.toString(),
		).toBe('ID!')
		expect(printSchema(schema)).toContain('type PostConnection')
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
			fields: (field) => ({ title: field.string() }),
		})
		const Audit = Schema.define({
			className: 'Audit',
			fields: (field) => ({ message: field.string() }),
		})
		const provider = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.audit-schema',
			privileges: [
				{ name: 'schema:declare', reason: 'Adds the audit fixture schema.' },
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.add({ contributionId: 'audit', schema: Audit })
			},
		})
		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [provider, graphqlPlugin()],
			schemas: [Post],
		})
		const schema = readGraphql(application).schema

		expect(schema.getType('Audit')).toBeDefined()
		expect(schema.getQueryType()?.getFields().getPost).toBeDefined()
		expect(schema.getQueryType()?.getFields().getAudit).toBeUndefined()
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
		const provider = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.private-schema',
			privileges: [
				{ name: 'schema:declare', reason: 'Adds a private fixture schema.' },
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.add({ contributionId: 'private', schema: Private })
			},
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
		const fieldType = definePluginFieldType({
			fieldKind: 'fixture.missing-codec',
			typegen: { module: '@fixture/missing-codec', valueType: 'MissingValue' },
		})
		const owner = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.missing-codec',
			privileges: [
				{ name: 'schema:declare', reason: 'Declares a codec fixture field.' },
			] as const,
			version: '1.0.0',
			declare: ({ fields }) => {
				fields.declareType(fieldType)
				return undefined
			},
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
		const graphql = readGraphql(application)
		expect(graphql.schema.getType('Visible')).toBeDefined()
		await application.dispose()
		expect(() => graphql.schema).toThrow('has been disposed')
	})

	it('rejects duplicate GraphQL owners and isolates parallel applications', async () => {
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
			fields: (field) => ({ value: field.string() }),
		})
		const Beta = Schema.define({
			className: 'Beta',
			fields: (field) => ({ value: field.string() }),
		})
		const [alpha, beta] = await Promise.all([
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [graphqlPlugin()],
				schemas: [Alpha],
			}),
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [graphqlPlugin()],
				schemas: [Beta],
			}),
		])

		expect(readGraphql(alpha).schema.getType('Beta')).toBeUndefined()
		expect(readGraphql(beta).schema.getType('Alpha')).toBeUndefined()
		await Promise.all([alpha.dispose(), beta.dispose()])
	})
})
