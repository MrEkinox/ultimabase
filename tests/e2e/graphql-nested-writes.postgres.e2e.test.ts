import { Schema, UltimaBase, type RequestContext } from '@ultimabase/core'
import {
	graphqlPlugin,
	type GraphqlSchemaExposureOption,
} from '@ultimabase/graphql-plugin'
import { httpApplicationIdHeader, httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { honoServerPlugin } from '@ultimabase/server-hono-plugin'
import { isPlainRecord } from '@ultimabase/shared'
import { graphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'
import { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedSchemaOptions {
		readonly graphql?: GraphqlSchemaExposureOption
	}
}

const Target = Schema.define({
	className: 'GraphqlNestedTarget',
	fields: (field) => ({
		name: field.string({ required: true }),
		score: field.bigint({ default: 0n }),
	}),
	graphql: true,
})

const Post = Schema.define({
	className: 'GraphqlNestedPost',
	fields: (field) => ({
		primary: field.pointer({ target: 'GraphqlNestedTarget' }),
		targets: field.relation({ target: 'GraphqlNestedTarget' }),
		title: field.string({ required: true }),
	}),
	graphql: true,
})

const Node = Schema.define({
	className: 'GraphqlNestedNode',
	fields: (field) => ({
		child: field.pointer({ target: 'GraphqlNestedNode' }),
		name: field.string({ required: true }),
	}),
	graphql: true,
})

const schemas = [Target, Post, Node] as const
const appId = 'graphql-nested-writes'
const hono = new Hono()
let fixture: PostgresWorkerFixture | undefined
let application:
	| UltimaBase<
			readonly [...typeof schemas],
			readonly [
				ReturnType<typeof httpPlugin>,
				ReturnType<typeof graphqlPlugin>,
				ReturnType<typeof graphqlYogaPlugin>,
				ReturnType<typeof honoServerPlugin>,
				ReturnType<typeof postgresPlugin>,
			]
	  >
	| undefined
let requestContext: RequestContext | undefined

const app = () => {
	if (application === undefined) {
		throw new TypeError('GraphQL nested-write application is unavailable')
	}
	return application
}

const context = (): RequestContext => {
	if (requestContext === undefined) {
		throw new TypeError('GraphQL nested-write context is unavailable')
	}
	return requestContext
}

const execute = (
	document: string,
	variables?: Readonly<Record<string, unknown>>,
) => {
	const graphql = app().application.getPlugin('@ultimabase/graphql-plugin')
	return graphql.execute({
		context: context(),
		document,
		...(variables === undefined ? {} : { variables }),
	})
}

const executeYoga = async (
	document: string,
	variables?: Readonly<Record<string, unknown>>,
): Promise<Readonly<Record<string, unknown>>> => {
	const response = await hono.fetch(
		new Request('http://localhost/graphql', {
			body: JSON.stringify({ query: document, variables }),
			headers: { 'Content-Type': 'application/json' },
			method: 'POST',
		}),
		{ incoming: { rawHeaders: [httpApplicationIdHeader, appId] } },
	)
	expect(response.status).toBe(200)
	const body: unknown = await response.json()
	if (!isPlainRecord(body))
		throw new TypeError('Expected GraphQL Yoga response')
	return body
}

const fieldResult = (
	data: unknown,
	field: string,
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(data) || !isPlainRecord(data[field])) {
		throw new TypeError(`Missing GraphQL result ${field}`)
	}
	return data[field]
}

const relationNodes = (
	value: unknown,
): readonly Readonly<Record<string, unknown>>[] => {
	if (!isPlainRecord(value) || !Array.isArray(value.nodes)) {
		throw new TypeError('Expected GraphQL relation connection')
	}
	if (!value.nodes.every(isPlainRecord)) {
		throw new TypeError('Expected GraphQL relation models')
	}
	return value.nodes
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({
		prefix: 'graphql_nested_writes',
	})
	application = new UltimaBase({
		pluginPrivileges: { logger: false },
		plugins: [
			httpPlugin({ appId }),
			graphqlPlugin({
				acknowledgeUnverifiedProtection: true,
				default: true,
			}),
			graphqlYogaPlugin(),
			honoServerPlugin({ app: hono, browserPolicyOwner: 'ultimabase' }),
			postgresPlugin({
				schemaPolicy: 'override',
				url: fixture.connectionUri,
			}),
		],
		schemas,
		validation: { timezone: 'UTC' },
	})
	try {
		await application.start()
		requestContext = application.engine.anonymous({
			requestId: 'graphql-nested-writes',
			source: 'ultimabase.graphql',
		}).context
	} catch (error: unknown) {
		await fixture.dispose()
		throw error
	}
}, 30_000)

afterAll(async () => {
	try {
		await application?.dispose()
	} finally {
		await fixture?.dispose()
	}
})

describe('GraphQL nested writes with PostgreSQL', { concurrent: false }, () => {
	it('executes recursive pointer and owning-relation commands networklessly', async () => {
		const [first, second, removed] = await Target.createMany(
			{ data: [{ name: 'First' }, { name: 'Second' }, { name: 'Removed' }] },
			{ context: context(), ultimabase: app() },
		)
		if (first === undefined || second === undefined || removed === undefined) {
			throw new TypeError('GraphQL nested-write seed is incomplete')
		}

		const created = await execute(
			`mutation Create($input: GraphqlNestedPostCreateInput!) {
				createGraphqlNestedPost(input: $input) {
					id title primary { id name score }
					targets(first: 10) { nodes { id name score } }
				}
			}`,
			{
				input: {
					primary: { create: { name: 'Pointer created', score: '1' } },
					targets: {
						connect: [removed.id],
						create: [{ name: 'Relation created', score: '2' }],
					},
					title: 'Created',
				},
			},
		)
		expect(created.errors).toBeUndefined()
		const createdPost = fieldResult(created.data, 'createGraphqlNestedPost')
		expect(createdPost.primary).toMatchObject({
			name: 'Pointer created',
			score: '1',
		})
		const createdTargets = relationNodes(createdPost.targets)
		expect(createdTargets.map(({ name }) => name).sort()).toEqual([
			'Relation created',
			'Removed',
		])
		const relationCreated = createdTargets.find(
			({ name }) => name === 'Relation created',
		)
		if (
			typeof createdPost.id !== 'string' ||
			relationCreated === undefined ||
			typeof relationCreated.id !== 'string'
		) {
			throw new TypeError('GraphQL nested create result is incomplete')
		}

		const updated = await execute(
			`mutation Update($input: GraphqlNestedPostUpdateOneInput!) {
				updateGraphqlNestedPost(input: $input) {
					title primary { name score }
					targets(first: 10) { nodes { name score } }
				}
			}`,
			{
				input: {
					data: {
						primary: {
							update: {
								name: { set: 'Pointer updated' },
								score: { increment: '2' },
							},
						},
						targets: {
							connect: [first.id],
							create: [{ name: 'Update created', score: '4' }],
							disconnect: [removed.id],
							update: [
								{
									data: {
										name: { set: 'Relation updated' },
										score: { increment: '3' },
									},
									id: relationCreated.id,
								},
							],
						},
						title: { set: 'Updated' },
					},
					id: createdPost.id,
				},
			},
		)
		expect(updated.errors).toBeUndefined()
		const updatedPost = fieldResult(updated.data, 'updateGraphqlNestedPost')
		expect(updatedPost.primary).toMatchObject({
			name: 'Pointer updated',
			score: '3',
		})
		expect(
			relationNodes(updatedPost.targets)
				.map(({ name }) => name)
				.sort(),
		).toEqual(['First', 'Relation updated', 'Update created'])

		for (const data of [
			{ primary: { disconnect: true } },
			{ primary: { connect: second.id } },
			{ primary: { create: { name: 'Pointer replaced' } } },
			{ targets: { set: [first.id, second.id] } },
			{ targets: { clear: true } },
		]) {
			const result = await execute(
				`mutation Update($input: GraphqlNestedPostUpdateOneInput!) {
					updateGraphqlNestedPost(input: $input) { id }
				}`,
				{ input: { data, id: createdPost.id } },
			)
			expect(result.errors).toBeUndefined()
		}

		const final = await Post.get(
			{
				id: createdPost.id,
				include: { primary: {}, targets: {} },
			},
			{ context: context(), ultimabase: app() },
		)
		expect(final.primary).toMatchObject({ name: 'Pointer replaced' })
		expect(final.targets).toEqual([])
	}, 30_000)

	it('keeps Yoga parity and reports Core graph failures safely', async () => {
		const target = await Target.createOne(
			{ data: { name: 'Yoga target' } },
			{ context: context(), ultimabase: app() },
		)
		const created = await executeYoga(
			`mutation Create($input: GraphqlNestedPostCreateInput!) {
				createGraphqlNestedPost(input: $input) {
					id title targets(first: 10) { nodes { name } }
				}
			}`,
			{
				input: {
					targets: { connect: [target.id] },
					title: 'Yoga created',
				},
			},
		)
		const post = fieldResult(created.data, 'createGraphqlNestedPost')
		expect(relationNodes(post.targets)).toEqual([{ name: 'Yoga target' }])
		if (typeof post.id !== 'string') {
			throw new TypeError('Yoga nested-write post ID is unavailable')
		}

		for (const targets of [
			{ connect: [target.id, target.id] },
			{ connect: [target.id], disconnect: [target.id] },
			{ clear: false },
			{ clear: true, set: [] },
		]) {
			const result = await executeYoga(
				`mutation Update($input: GraphqlNestedPostUpdateOneInput!) {
					updateGraphqlNestedPost(input: $input) { id }
				}`,
				{
					input: {
						data: { targets, title: { set: 'Must roll back' } },
						id: post.id,
					},
				},
			)
			expect(result).toMatchObject({
				data: { updateGraphqlNestedPost: null },
				errors: [
					{
						extensions: {
							code: 'VALIDATION_ERROR',
							retryable: false,
						},
					},
				],
			})
			const errors: unknown = result.errors
			const firstError: unknown = Array.isArray(errors) ? errors[0] : undefined
			const extensions: unknown = isPlainRecord(firstError)
				? firstError.extensions
				: undefined
			expect(
				isPlainRecord(extensions) ? typeof extensions.requestId : undefined,
			).toBe('string')
		}
		expect(
			await Post.get(
				{ id: post.id },
				{ context: context(), ultimabase: app() },
			),
		).toMatchObject({ title: 'Yoga created' })

		let nested: unknown = { name: 'Depth 6' }
		for (let depth = 5; depth >= 0; depth -= 1) {
			nested = { child: { create: nested }, name: `Depth ${String(depth)}` }
		}
		const depthFailure = await execute(
			`mutation Create($input: GraphqlNestedNodeCreateInput!) {
				createGraphqlNestedNode(input: $input) { id }
			}`,
			{ input: nested },
		)
		expect(depthFailure.errors?.[0]?.extensions).toMatchObject({
			code: 'VALIDATION_ERROR',
			requestId: 'graphql-nested-writes',
		})
		expect(
			await Node.count({}, { context: context(), ultimabase: app() }),
		).toBe(0)

		const targetCount = await Target.count(
			{},
			{ context: context(), ultimabase: app() },
		)
		const operationFailure = await execute(
			`mutation Create($input: GraphqlNestedPostCreateInput!) {
				createGraphqlNestedPost(input: $input) { id }
			}`,
			{
				input: {
					targets: {
						create: Array.from({ length: 50 }, (_, index) => ({
							name: `Overflow ${String(index)}`,
						})),
					},
					title: 'Operation overflow',
				},
			},
		)
		expect(operationFailure.errors?.[0]?.extensions).toMatchObject({
			code: 'VALIDATION_ERROR',
		})
		expect(
			await Target.count({}, { context: context(), ultimabase: app() }),
		).toBe(targetCount)
	}, 30_000)
})
