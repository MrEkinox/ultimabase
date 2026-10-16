import { describe, expect, it } from 'vitest'
import { immutableRecord } from '@ultimabase/shared'

import { plugin } from '../../plugins/plugin.js'
import type { CreateOneOperationAst } from '../../query/operations/contracts.js'

import { provideRuntimeBehavior } from '../capabilities.js'
import { UltimaBase } from '../application/ultima-base.js'
import type { RuntimeBehaviorStages } from '../pipeline/contracts.js'
import {
	createRequestExecutionDatabasePlugin,
	createRequestExecutionHarnessPlugin,
	runAsRequestExecutionHarness,
	type RequestExecutionHarness,
} from '../../../tests/runtime/fixtures/application-request-execution-harness.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'

const instant = '2026-09-08T10:00:00.000Z'
const childId = '0199c2d0-0000-7000-8000-000000000001'
const rootId = '0199c2d0-0000-7000-8000-000000000002'
const tagId = '0199c2d0-0000-7000-8000-000000000003'
const redirectedId = '0199c2d0-0000-7000-8000-000000000004'
let relationWhereInvocations = 0

const Author = UltimaBase.Schema.define({
	className: 'NestedRuntimeAuthor',
	fields: (field) => ({ name: field.string({ required: true }) }),
})

const Post = UltimaBase.Schema.define({
	className: 'NestedRuntimePost',
	fields: (field) => ({
		author: field.pointer({ target: 'NestedRuntimeAuthor' }),
		tags: field.relation({ target: 'NestedRuntimeTag' }),
		title: field.string({ required: true }),
	}),
}).with((plugins) =>
	plugins.relations({
		tags: {
			where: () => {
				relationWhereInvocations += 1
				return {}
			},
		},
	}),
)

const Tag = UltimaBase.Schema.define({
	className: 'NestedRuntimeTag',
	fields: (field) => ({ label: field.string({ required: true }) }),
})

const record = (
	id: string,
	values: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => ({
	createdAt: instant,
	id,
	updatedAt: instant,
	...values,
})

/** Installs one focused behavior without giving the fixture any other privilege. */
const createNestedBehaviorPlugin = (value: RuntimeBehaviorStages) =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.nested-runtime-behavior',
		version: '0.0.0',
		permissions: {
			'runtime:intercept':
				'Verifies nested request inheritance and pointer binding.',
		},
		contributions: [
			provideRuntimeBehavior({
				contributionId: 'nested-runtime-observation',
				create: () => ({ value }),
			}),
		],
	})

describe('Runtime nested create and connect execution', () => {
	it('runs pointer children before the source with reserved stable identities', async () => {
		const trace: string[] = []
		const author = record(childId, { name: 'Ada' })
		const post = record(rootId, {
			author: Author.pointer(childId),
			title: 'Nested',
		})
		const adapter = new RecordingDatabaseAdapter(
			[
				{
					materializations: [{ current: author, kind: 'create' }],
					status: 'fulfilled',
					value: author,
				},
				{
					materializations: [{ current: post, kind: 'create' }],
					status: 'fulfilled',
					value: post,
				},
			],
			trace,
		)
		const generatedIds = [childId, rootId]
		await using ultimabase = new (UltimaBase.use(
			createRequestExecutionDatabasePlugin(adapter),
		))({
			schemas: [Author, Post, Tag],
			validation: {
				clock: () => new Date(instant),
				uuidV7Generator: () => {
					const id = generatedIds.shift()
					if (id === undefined) throw new TypeError('Unexpected ID reservation')
					return id
				},
			},
		})
		await ultimabase.start()

		const created = await Post.createOne({
			data: {
				author: { create: { name: 'Ada' } },
				title: 'Nested',
			},
		})

		expect(created.id).toBe(rootId)
		expect(generatedIds).toEqual([])
		expect(
			adapter.transactions[0]?.requests.map(({ operation }) => operation.kind),
		).toEqual(['create-one', 'create-one'])
		const [childRequest, rootRequest] = adapter.transactions[0]?.requests ?? []
		expect(childRequest?.operation).toMatchObject({
			input: { id: childId, name: 'Ada' },
			kind: 'create-one',
		})
		expect(rootRequest?.operation).toMatchObject({
			input: {
				author: Author.pointer(childId),
				id: rootId,
				title: 'Nested',
			},
			kind: 'create-one',
		})
		expect(trace.at(-1)).toBe('adapter:commit')
	})

	it('preflights connect targets and rolls a persisted source back on child failure', async () => {
		relationWhereInvocations = 0
		const trace: string[] = []
		const root = record(rootId, { title: 'Root' })
		const childFailure = new Error('nested child failed')
		const adapter = new RecordingDatabaseAdapter(
			[
				{ status: 'fulfilled', value: record(tagId, { label: 'Existing' }) },
				{
					materializations: [{ current: root, kind: 'create' }],
					status: 'fulfilled',
					value: root,
				},
				{ error: childFailure, status: 'rejected' },
			],
			trace,
		)
		const generatedIds = [childId, rootId]
		await using ultimabase = new (UltimaBase.use(
			createRequestExecutionDatabasePlugin(adapter),
		))({
			schemas: [Author, Post, Tag],
			validation: {
				clock: () => new Date(instant),
				uuidV7Generator: () => generatedIds.shift() ?? rootId,
			},
		})
		await ultimabase.start()

		await expect(
			Post.createOne({
				data: {
					tags: {
						connect: [tagId],
						create: [{ label: 'New' }],
					},
					title: 'Root',
				},
			}),
		).rejects.toBe(childFailure)

		expect(
			adapter.transactions[0]?.requests.map(({ operation }) => operation.kind),
		).toEqual(['find-one', 'create-one', 'create-one'])
		expect(trace).toContain('adapter:rollback')
		expect(trace).not.toContain('adapter:commit')
		expect(relationWhereInvocations).toBe(0)
	})

	it('shares request context and rolls back when resolution redirects a graph pointer', async () => {
		const trace: string[] = []
		const contexts: object[] = []
		const graphs: object[] = []
		const author = record(childId, { name: 'Ada' })
		const adapter = new RecordingDatabaseAdapter(
			[
				{
					materializations: [{ current: author, kind: 'create' }],
					status: 'fulfilled',
					value: author,
				},
			],
			trace,
		)
		const behavior = createNestedBehaviorPlugin({
			transformInput: (input) => {
				contexts.push(input.context)
				if (input.nestedWrite !== undefined) {
					graphs.push(input.nestedWrite.graph)
				}
				if (
					input.operation.kind !== 'create-one' ||
					input.nestedWrite?.node.schema !== Post
				) {
					return input.operation
				}
				const operation = input.operation as unknown as CreateOneOperationAst<
					typeof Post
				>

				return immutableRecord({
					...operation,
					input: immutableRecord({
						...operation.input,
						author: Author.pointer(redirectedId),
					}),
				}) as unknown as typeof input.operation
			},
		})
		const generatedIds = [childId, rootId]
		await using ultimabase = new (UltimaBase.use(
			behavior,
			createRequestExecutionDatabasePlugin(adapter),
		))({
			schemas: [Author, Post, Tag],
			validation: {
				clock: () => new Date(instant),
				uuidV7Generator: () => generatedIds.shift() ?? rootId,
			},
		})
		await ultimabase.start()

		await expect(
			Post.createOne({
				data: {
					author: { create: { name: 'Ada' } },
					title: 'Redirected',
				},
			}),
		).rejects.toThrow(
			'Nested pointer resolution changed its graph target: NestedRuntimePost.author',
		)

		expect(new Set(contexts).size).toBe(1)
		expect(new Set(graphs).size).toBe(1)
		expect(adapter.transactions[0]?.requests).toHaveLength(1)
		expect(trace).toContain('adapter:rollback')
		expect(trace).not.toContain('adapter:commit')
	})

	it('inherits cancellation and rolls back after a completed nested child', async () => {
		const controller = new AbortController()
		const trace: string[] = []
		const author = record(childId, { name: 'Ada' })
		const adapter = new RecordingDatabaseAdapter(
			[
				{
					materializations: [{ current: author, kind: 'create' }],
					status: 'fulfilled',
					value: author,
				},
			],
			trace,
		)
		const behavior = createNestedBehaviorPlugin({
			transformResult: (input) => {
				if (input.nestedWrite?.node.schema === Author) {
					controller.abort('nested child completed')
				}
				return input.result
			},
		})
		const harness: RequestExecutionHarness = {}
		const generatedIds = [childId, rootId]
		await using ultimabase = new (UltimaBase.use(
			createRequestExecutionHarnessPlugin(harness),
			behavior,
			createRequestExecutionDatabasePlugin(adapter),
		))({
			schemas: [Author, Post, Tag],
			validation: {
				clock: () => new Date(instant),
				uuidV7Generator: () => generatedIds.shift() ?? rootId,
			},
		})
		await ultimabase.start()
		const context = runAsRequestExecutionHarness(harness, (executor) =>
			executor.createAnonymousContext({
				requestId: 'nested-cancellation',
				signal: controller.signal,
				source: 'fixture-http',
			}),
		)

		await expect(
			runAsRequestExecutionHarness(harness, (executor) =>
				executor.executeMutation(context, Post, {
					kind: 'create-one',
					input: {
						data: {
							author: { create: { name: 'Ada' } },
							title: 'Cancelled',
						},
					},
				}),
			),
		).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
		expect(adapter.transactions[0]?.requests).toHaveLength(1)
		expect(trace).toContain('adapter:rollback')
		expect(trace).not.toContain('adapter:commit')
	})
})
