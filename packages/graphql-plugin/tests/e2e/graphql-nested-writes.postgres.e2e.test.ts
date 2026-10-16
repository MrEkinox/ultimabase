import { UltimaBase } from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { httpApplicationIdHeader, httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { honoServerPlugin } from '@ultimabase/hono-server-plugin'
import { isPlainRecord } from '@ultimabase/shared'
import { graphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'
import { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import type { RequestContext } from '@ultimabase/core/plugin'
import { anonymous } from '@ultimabase/core/plugin'

const appId = 'graphql-nested-writes'
const GraphqlSchemaApplication = UltimaBase.use(httpPlugin({ appId })).use(
	graphqlPlugin({ publicWrites: true, default: true }),
)

const Target = GraphqlSchemaApplication.Schema.define({
	className: 'GraphqlNestedTarget',
	fields: (field) => ({
		name: field.string({ required: true }),
		score: field.bigint({ default: 0n }),
	}),
}).with((plugins) => plugins.graphql(true))

const Post = GraphqlSchemaApplication.Schema.define({
	className: 'GraphqlNestedPost',
	fields: (field) => ({
		primary: field.pointer({ target: 'GraphqlNestedTarget' }),
		targets: field.relation({ target: 'GraphqlNestedTarget' }),
		title: field.string({ required: true }),
		headline: field.virtual({
			output: (output) => output.string({ nullable: false }),
			resolve: async ({ item }) => {
				await Promise.resolve()
				return `Post: ${String(item.title)}`
			},
			select: { title: true },
		}),
	}),
}).with((plugins) => plugins.graphql(true))

const Node = GraphqlSchemaApplication.Schema.define({
	className: 'GraphqlNestedNode',
	fields: (field) => ({
		child: field.pointer({ target: 'GraphqlNestedNode' }),
		name: field.string({ required: true }),
	}),
}).with((plugins) => plugins.graphql(true))

const schemas = [Target, Post, Node] as const
const hono = new Hono()
let fixture: PostgresWorkerFixture | undefined
const createPostgresApplication = (connectionUri: string) => {
	const Application = GraphqlSchemaApplication.use(graphqlYogaPlugin())
		.use(honoServerPlugin({ app: hono, browserPolicyOwner: 'ultimabase' }))
		.use(postgresPlugin({ schemaPolicy: 'override', url: connectionUri }))
	return new Application({
		logger: false,
		schemas,
		validation: { timezone: 'UTC' },
	})
}
let application: ReturnType<typeof createPostgresApplication> | undefined
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
	const graphql = app().plugin('@ultimabase/graphql-plugin')
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
	application = createPostgresApplication(fixture.connectionUri)
	try {
		await application.start()
		requestContext = anonymous(application, {
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
			{ context: context() },
		)
		if (first === undefined || second === undefined || removed === undefined) {
			throw new TypeError('GraphQL nested-write seed is incomplete')
		}

		const created = await execute(
			`mutation Create($input: GraphqlNestedPostCreateInput!) {
				createGraphqlNestedPost(input: $input) {
					id title headline primary { id name score }
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
		expect(createdPost.headline).toBe('Post: Created')
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
					title headline primary { name score }
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
					where: { id: { eq: createdPost.id } },
				},
			},
		)
		expect(updated.errors).toBeUndefined()
		const updatedPost = fieldResult(updated.data, 'updateGraphqlNestedPost')
		expect(updatedPost.headline).toBe('Post: Updated')
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
			{ primary: null },
			{ primary: { connect: second.id } },
			{ primary: { create: { name: 'Pointer replaced' } } },
			{ targets: { set: [first.id, second.id] } },
			{ targets: { set: [] } },
		]) {
			const result = await execute(
				`mutation Update($input: GraphqlNestedPostUpdateOneInput!) {
					updateGraphqlNestedPost(input: $input) { id }
				}`,
				{ input: { data, where: { id: { eq: createdPost.id } } } },
			)
			expect(result.errors).toBeUndefined()
		}

		const final = await Post.findOneOrThrow(
			{
				where: { id: createdPost.id },
				include: { primary: {}, targets: {} },
			},
			{ context: context() },
		)
		expect(final.primary).toMatchObject({ name: 'Pointer replaced' })
		expect(final.targets).toEqual([])
	}, 30_000)

	it('keeps Yoga parity and reports Core graph failures safely', async () => {
		const target = await Target.createOne(
			{ data: { name: 'Yoga target' } },
			{ context: context() },
		)
		const created = await executeYoga(
			`mutation Create($input: GraphqlNestedPostCreateInput!) {
				createGraphqlNestedPost(input: $input) {
					id title headline targets(first: 10) { nodes { name } }
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
		expect(post.headline).toBe('Post: Yoga created')
		expect(relationNodes(post.targets)).toEqual([{ name: 'Yoga target' }])
		if (typeof post.id !== 'string') {
			throw new TypeError('Yoga nested-write post ID is unavailable')
		}

		for (const targets of [
			{ connect: [target.id, target.id] },
			{ connect: [target.id], disconnect: [target.id] },
			{ connect: [target.id], set: [target.id] },
			{ disconnect: [target.id], set: [] },
		]) {
			const result = await executeYoga(
				`mutation Update($input: GraphqlNestedPostUpdateOneInput!) {
					updateGraphqlNestedPost(input: $input) { id }
				}`,
				{
					input: {
						data: { targets, title: { set: 'Must roll back' } },
						where: { id: { eq: post.id } },
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
			await Post.findOneOrThrow(
				{ where: { id: post.id } },
				{ context: context() },
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
		expect(await Node.count({}, { context: context() })).toBe(0)

		const targetCount = await Target.count({}, { context: context() })
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
		expect(await Target.count({}, { context: context() })).toBe(targetCount)
	}, 30_000)
})
