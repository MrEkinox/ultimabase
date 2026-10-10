import { accessPlugin } from '@ultimabase/access-plugin'
import {
	MasterAuthority,
	UltimaBase,
	type RequestContext,
	type PluginSourceState,
	type Model,
} from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import {
	executeRestMutationRequest,
	restMutationErrorCodes,
	restPlugin,
} from '@ultimabase/rest-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'
import {
	createRestMutationExecutionHarnessPlugin,
	runAsRestMutationExecutionHarness,
	type RestMutationExecutionHarness,
} from '../../../../tests/fixtures/rest-mutation-request-harness.js'
import { isPlainResult } from '../../../../tests/fixtures/plain-results.js'

const RestNestedWriteApplication = UltimaBase.use(accessPlugin())

const Target = RestNestedWriteApplication.Schema.define({
	className: 'RestNestedTarget',
	access: { update: false },
	fields: (field) => ({
		name: field.string({ required: true }),
		score: field.bigint({ default: 0n }),
	}),
})

const Post = RestNestedWriteApplication.Schema.define({
	className: 'RestNestedPost',
	fields: (field) => ({
		headline: field.virtual({
			output: (output) => output.string({ nullable: false }),
			resolve: async ({ item }) => {
				await Promise.resolve()
				return `Post: ${String(item.title)}`
			},
			select: { title: true },
		}),
		primary: field.pointer({ target: 'RestNestedTarget' }),
		targets: field.relation({ target: 'RestNestedTarget' }),
		title: field.string({ required: true }),
	}),
})

const Node = RestNestedWriteApplication.Schema.define({
	className: 'RestNestedNode',
	fields: (field) => ({
		child: field.pointer({ target: 'RestNestedNode' }),
		name: field.string({ required: true }),
	}),
})

const schemas = [Target, Post, Node] as const
const harness: RestMutationExecutionHarness = {}
let fixture: PostgresWorkerFixture | undefined
let application:
	| UltimaBase<
			readonly [...typeof schemas],
			readonly [
				ReturnType<typeof accessPlugin>,
				ReturnType<typeof restPlugin>,
				ReturnType<typeof createRestMutationExecutionHarnessPlugin>,
				ReturnType<typeof postgresPlugin>,
			],
			PluginSourceState
	  >
	| undefined
let anonymous: RequestContext | undefined
let master: RequestContext | undefined

const jsonRequest = (method: 'PATCH' | 'POST', path: string, body: unknown) =>
	new Request(`https://example.test${path}`, {
		body: JSON.stringify(body),
		headers: { 'Content-Type': 'application/json' },
		method,
	})

const getContext = (mode: 'anonymous' | 'master'): RequestContext => {
	const context = mode === 'master' ? master : anonymous
	if (context === undefined) {
		throw new TypeError(`REST nested-write ${mode} context is unavailable`)
	}
	return context
}

const toJson = (value: unknown): Readonly<Record<string, unknown>> => {
	if (typeof value !== 'object' || value === null) {
		throw new TypeError('Expected one REST nested-write model')
	}
	const model = value as { readonly toJSON?: unknown }
	if (typeof model.toJSON !== 'function') {
		throw new TypeError('Expected one REST nested-write model')
	}
	return (
		model as { readonly toJSON: () => Readonly<Record<string, unknown>> }
	).toJSON()
}

const includedTargets = (
	value: unknown,
): readonly (Model<typeof Target> & Readonly<{ id: string }>)[] => {
	if (
		!Array.isArray(value) ||
		!value.every(
			(item) =>
				isPlainResult(item) && typeof Reflect.get(item, 'id') === 'string',
		)
	) {
		throw new TypeError('Expected included REST nested-write targets')
	}
	return value as readonly (Model<typeof Target> & Readonly<{ id: string }>)[]
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'rest_nested_writes' })
	application = new (UltimaBase.use(
		accessPlugin({ default: true }),
		restPlugin(),
		createRestMutationExecutionHarnessPlugin(harness),
		postgresPlugin({
			schemaPolicy: 'override',
			url: fixture.connectionUri,
		}),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'rest-nested-writes', value: 'server-only' }],
			onUse: () => undefined,
		}),
		schemas,
		validation: { timezone: 'UTC' },
	})
	try {
		await application.start()
		anonymous = runAsRestMutationExecutionHarness(harness, (executor) =>
			executor.createAnonymousContext({
				requestId: 'rest-nested-anonymous',
				source: 'ultimabase.rest',
			}),
		)
		master = await runAsRestMutationExecutionHarness(harness, (executor) =>
			executor.verifyMasterKey({
				context: anonymous as RequestContext<{ readonly mode: 'anonymous' }>,
				rawKey: 'server-only',
				reason: 'REST nested-write PostgreSQL fixture',
			}),
		)
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

describe('REST nested writes with PostgreSQL', { concurrent: false }, () => {
	it('executes every pointer and owning-relation command with root inclusion', async () => {
		const context = getContext('master')
		const [first, second, removed] = await Target.createMany(
			{
				data: [{ name: 'First' }, { name: 'Second' }, { name: 'Removed' }],
			},
			{ context },
		)
		if (first === undefined || second === undefined || removed === undefined) {
			throw new TypeError('REST nested-write seed is incomplete')
		}

		const created = await runAsRestMutationExecutionHarness(
			harness,
			(executor) =>
				executeRestMutationRequest(executor, context, Post, {
					operation: 'create',
					request: jsonRequest(
						'POST',
						'/posts?select=id,title,headline&include=primary,targets',
						{
							primary: { create: { name: 'Pointer created', score: '1' } },
							targets: {
								connect: [removed.id],
								create: [{ name: 'Relation created', score: '2' }],
							},
							title: 'Created',
						},
					),
				}),
		)
		const createdJson = toJson(created)
		expect(createdJson.headline).toBe('Post: Created')
		const createdTargets = includedTargets(createdJson.targets)
		const relationCreated = createdTargets.find(
			({ name }) => name === 'Relation created',
		)
		if (relationCreated === undefined) {
			throw new TypeError('Nested relation create result is unavailable')
		}
		expect(toJson(createdJson.primary)).toMatchObject({
			name: 'Pointer created',
			score: 1n,
		})
		expect(createdTargets.map(({ name }) => name).sort()).toEqual([
			'Relation created',
			'Removed',
		])

		const postId = String(createdJson.id)
		const updated = await runAsRestMutationExecutionHarness(
			harness,
			(executor) =>
				executeRestMutationRequest(executor, context, Post, {
					id: postId,
					operation: 'update',
					request: jsonRequest(
						'PATCH',
						'/posts/item?select=id,title,headline&include=primary,targets',
						{
							primary: { update: { name: 'Pointer updated', score: '3' } },
							targets: {
								connect: [first.id],
								create: [{ name: 'Update created', score: '4' }],
								disconnect: [removed.id],
								update: [
									{
										data: { name: 'Relation updated', score: '5' },
										id: relationCreated.id,
									},
								],
							},
							title: 'Updated',
						},
					),
				}),
		)
		if (updated === null)
			throw new TypeError('REST nested update returned null')
		const updatedJson = toJson(updated)
		expect(updatedJson.headline).toBe('Post: Updated')
		expect(toJson(updatedJson.primary)).toMatchObject({
			name: 'Pointer updated',
			score: 3n,
		})
		expect(
			includedTargets(updatedJson.targets)
				.map(({ name }) => name)
				.sort(),
		).toEqual(['First', 'Relation updated', 'Update created'])

		for (const data of [
			{ primary: null },
			{ primary: { connect: second.id } },
			{ primary: { create: { name: 'Pointer replaced' } } },
			{ targets: { set: [first.id, second.id] } },
			{ targets: { set: [] } },
		] as const) {
			await runAsRestMutationExecutionHarness(harness, (executor) =>
				executeRestMutationRequest(executor, context, Post, {
					id: postId,
					operation: 'update',
					request: jsonRequest('PATCH', '/posts/item', data),
				}),
			)
		}

		const final = await Post.findOneOrThrow(
			{ where: { id: postId }, include: { primary: {}, targets: {} } },
			{ context },
		)
		expect(final.primary).toMatchObject({ name: 'Pointer replaced' })
		expect(includedTargets(final.targets)).toEqual([])
	})

	it('retains child authorization under anonymous and audited Master contexts', async () => {
		const masterContext = getContext('master')
		const target = await Target.createOne(
			{ data: { name: 'Protected' } },
			{ context: masterContext },
		)
		const post = await Post.createOne(
			{
				data: {
					primary: { connect: target.id },
					title: 'Authorization root',
				},
			},
			{ context: masterContext },
		)

		await expect(
			runAsRestMutationExecutionHarness(harness, (executor) =>
				executeRestMutationRequest(executor, getContext('anonymous'), Post, {
					id: post.id,
					operation: 'update',
					request: jsonRequest('PATCH', '/posts/item', {
						primary: { update: { name: 'Anonymous change' } },
						title: 'Must roll back',
					}),
				}),
			),
		).rejects.toMatchObject({ code: 'NOT_FOUND' })
		expect(
			await Post.findOneOrThrow(
				{ where: { id: post.id } },
				{ context: masterContext },
			),
		).toMatchObject({
			title: 'Authorization root',
		})

		await runAsRestMutationExecutionHarness(harness, (executor) =>
			executeRestMutationRequest(executor, masterContext, Post, {
				id: post.id,
				operation: 'update',
				request: jsonRequest('PATCH', '/posts/item', {
					primary: { update: { name: 'Master change' } },
				}),
			}),
		)
		expect(
			await Target.findOneOrThrow(
				{ where: { id: target.id } },
				{ context: masterContext },
			),
		).toMatchObject({ name: 'Master change' })
	})

	it('rejects conflicts and Core limits before retaining partial work', async () => {
		const context = getContext('master')
		const target = await Target.createOne(
			{ data: { name: 'Conflict target' } },
			{ context },
		)
		const post = await Post.createOne(
			{ data: { targets: { connect: [target.id] }, title: 'Stable' } },
			{ context },
		)

		for (const targets of [
			{ connect: [target.id, target.id] },
			{ connect: [target.id], disconnect: [target.id] },
			{ connect: [target.id], set: [] },
		]) {
			await expect(
				runAsRestMutationExecutionHarness(harness, (executor) =>
					executeRestMutationRequest(executor, context, Post, {
						id: post.id,
						operation: 'update',
						request: jsonRequest('PATCH', '/posts/item', {
							targets,
							title: 'Must roll back',
						}),
					}),
				),
			).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
		}
		expect(
			await Post.findOneOrThrow({ where: { id: post.id } }, { context }),
		).toMatchObject({
			title: 'Stable',
		})

		let nested: unknown = { name: 'Depth 6' }
		for (let depth = 5; depth >= 0; depth -= 1) {
			nested = { child: { create: nested }, name: `Depth ${String(depth)}` }
		}
		await expect(
			runAsRestMutationExecutionHarness(harness, (executor) =>
				executeRestMutationRequest(executor, context, Node, {
					operation: 'create',
					request: jsonRequest('POST', '/nodes', nested),
				}),
			),
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
		expect(await Node.count({}, { context })).toBe(0)

		const targetCount = await Target.count({}, { context })
		await expect(
			runAsRestMutationExecutionHarness(harness, (executor) =>
				executeRestMutationRequest(executor, context, Post, {
					operation: 'create',
					request: jsonRequest('POST', '/posts', {
						targets: {
							create: Array.from({ length: 50 }, (_, index) => ({
								name: `Overflow ${String(index)}`,
							})),
						},
						title: 'Operation overflow',
					}),
				}),
			),
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
		expect(await Target.count({}, { context })).toBe(targetCount)
	})

	it('keeps malformed identity and legacy pointer tags at the REST boundary', async () => {
		for (const primary of [
			{ connect: 'not-a-uuid-v7' },
			{
				className: 'RestNestedTarget',
				id: '01991f00-0000-7000-8000-000000000001',
				type: 'pointer',
			},
		]) {
			await expect(
				runAsRestMutationExecutionHarness(harness, (executor) =>
					executeRestMutationRequest(executor, getContext('master'), Post, {
						operation: 'create',
						request: jsonRequest('POST', '/posts', {
							primary,
							title: 'Invalid',
						}),
					}),
				),
			).rejects.toMatchObject({ code: restMutationErrorCodes.invalidInput })
		}
	})
})
