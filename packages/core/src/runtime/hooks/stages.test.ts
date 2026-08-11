import {
	FrameworkApplication,
	createApplication,
	definePlugin,
} from '../../foundation.js'
import { QueryBuilder } from '../../query/index.js'
import { Schema } from '../../schema/index.js'
import { describe, expect, it, vi } from 'vitest'

import { RequestContext, requestSources } from '../context/request-context.js'
import type {
	CreateOneOperationAst,
	UpdateOneOperationAst,
} from '../../query/index.js'
import type {
	RuntimeOperationStageInput,
	RuntimeResultStageInput,
} from '../pipeline/contracts.js'
import {
	afterOperation,
	beforeOperation,
	postCommitEvent,
	preparedOperation,
} from './definitions.js'
import { createRuntimeHookStages } from './stages.js'

const articleSchema = Schema.define({
	className: 'HookStageArticle',
	fields: (field) => ({
		title: field.string({ validation: { required: true } }),
	}),
})

const foreignSchema = Schema.define({
	className: 'HookStageForeign',
	fields: (field) => ({
		title: field.string({ validation: { required: true } }),
	}),
})

const context = RequestContext.anonymous({
	requestId: 'hook-stage-1',
	source: requestSources.internal,
})

const operation: CreateOneOperationAst<typeof articleSchema> = {
	kind: 'create-one',
	selection: { fields: [], kind: 'selection' },
	schema: new QueryBuilder(articleSchema).ast.schema,
	input: { title: 'input' },
}

const updateOperation: UpdateOneOperationAst<typeof articleSchema> = {
	kind: 'update-one',
	query: new QueryBuilder(articleSchema).where((where) =>
		where.eq('id', 'article-1'),
	).ast,
	update: {
		kind: 'update-expression',
		operations: [{ field: 'title', kind: 'set', value: 'input' }],
	},
}

const updateTarget = Object.freeze({
	createdAt: '2026-08-01T00:00:00.000Z',
	id: 'article-1',
	title: 'stored',
	updatedAt: '2026-08-01T00:00:00.000Z',
})

describe('createRuntimeHookStages', () => {
	it('requires an initialized FrameworkApplication', async () => {
		expect(() => createRuntimeHookStages({} as never)).toThrow(
			new TypeError('Runtime hook stages require a FrameworkApplication'),
		)

		const application = new FrameworkApplication({
			schemas: [articleSchema],
			plugins: [],
		})

		expect(() => createRuntimeHookStages(application)).toThrow(
			new TypeError(
				'Application capabilities require completed materialization',
			),
		)
		await application.dispose()
	})

	it('rejects values not created by Runtime contribution factories', async () => {
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.invalid-hook',
			setup: ({ runtime }) => {
				runtime.register('fixture.invalid', (() => undefined) as never)
			},
		})
		await expect(
			createApplication({
				schemas: [articleSchema],
				plugins: [plugin],
			}),
		).rejects.toThrow(
			new TypeError(
				'Runtime contributions must be created by a Runtime interception or enforcement factory',
			),
		)
	})

	it('rejects contribution kinds registered in the wrong Core category', async () => {
		const eventInHooks = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.event-in-hooks',
			setup: ({ runtime }) => {
				runtime.register(
					'fixture.wrong-event',
					postCommitEvent({ handler: () => undefined }) as never,
				)
			},
		})
		const hookInEvents = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.hook-in-events',
			setup: ({ events }) => {
				events.register(
					'fixture.wrong-hook',
					beforeOperation({
						handler: () => undefined,
					}) as never,
				)
			},
		})

		for (const plugin of [eventInHooks, hookInEvents]) {
			await expect(
				createApplication({
					schemas: [articleSchema],
					plugins: [plugin],
				}),
			).rejects.toThrow(/contributions must be created by/u)
		}
	})

	it('rejects schema scopes outside the owning application', async () => {
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.foreign-hook',
			privileges: [
				{
					name: 'runtime:intercept',
					reason: 'Registers low-level Runtime hooks for tests.',
				},
			],
			setup: ({ runtime }) => {
				runtime.register(
					'fixture.foreign',
					beforeOperation({
						schema: foreignSchema,
						handler: () => undefined,
					}),
				)
			},
		})
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [plugin],
		})

		expect(() => createRuntimeHookStages(application)).toThrow(
			new TypeError(
				'Runtime contribution "fixture.foreign" references a schema outside its application',
			),
		)
	})

	it('requires before observers to return nothing and exact after replacements', async () => {
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.invalid-output',
			privileges: [
				{
					name: 'runtime:intercept',
					reason: 'Registers low-level Runtime hooks for tests.',
				},
			],
			setup: ({ runtime }) => {
				runtime.register(
					'fixture.invalid-before-output',
					beforeOperation({
						operations: ['create-one'],
						handler: ((input: RuntimeOperationStageInput<typeof operation>) =>
							input.operation) as never,
					}),
				)
				runtime.register(
					'fixture.invalid-after-output',
					afterOperation({
						operations: ['create-one'],
						handler: ((input: RuntimeResultStageInput<typeof operation>) => ({
							result: input.result,
							extra: true,
						})) as never,
					}),
				)
			},
		})
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [plugin],
		})
		const stages = createRuntimeHookStages(application)

		await expect(
			stages.globalBeforeHooks({ context, operation }),
		).rejects.toThrow(
			new TypeError('before-operation hook must return undefined'),
		)
		await expect(
			stages.globalAfterHooks({
				context,
				operation,
				result: {
					id: 'article-1',
					title: 'stored',
					createdAt: '2026-08-01T00:00:00.000Z',
					updatedAt: '2026-08-01T00:00:00.000Z',
				},
			}),
		).rejects.toThrow(
			new TypeError('runtime hook must return exactly { result }'),
		)
	})

	it('rejects every attempted low-level before-operation replacement', async () => {
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.before-replacement',
			privileges: [
				{
					name: 'runtime:intercept',
					reason: 'Registers low-level Runtime hooks for tests.',
				},
			],
			setup: ({ runtime }) => {
				runtime.register(
					'fixture.before-replacement',
					beforeOperation({
						operations: ['update-one'],
						handler: ((
							input: RuntimeOperationStageInput<typeof updateOperation>,
						) => ({
							operation: input.operation,
						})) as never,
					}),
				)
			},
		})
		const application = await createApplication({
			plugins: [plugin],
			schemas: [articleSchema],
		})
		const stages = createRuntimeHookStages(application)

		await expect(
			stages.globalBeforeHooks({ context, operation: updateOperation }),
		).rejects.toThrow(
			new TypeError('before-operation hook must return undefined'),
		)
	})

	it('resolves only update values against one locked singular target', async () => {
		const handler = vi.fn()
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.prepared-value',
			privileges: [
				{
					name: 'runtime:intercept',
					reason: 'Registers low-level Runtime hooks for tests.',
				},
			],
			setup: ({ runtime }) => {
				runtime.register(
					'fixture.prepared-value',
					preparedOperation({
						schema: articleSchema,
						handler: ({ operation: current, target }) => {
							handler(target)

							return {
								operation: {
									...current,
									update: {
										...current.update,
										operations: current.update.operations.map((candidate) => ({
											...candidate,
											value: target.title,
										})),
									},
								},
							}
						},
					}),
				)
			},
		})
		const application = await createApplication({
			plugins: [plugin],
			schemas: [articleSchema],
		})
		const stages = createRuntimeHookStages(application)
		const resolved = await stages.preparedOperationHooks({
			context,
			operation: updateOperation,
			target: updateTarget,
		})

		expect(resolved.update.operations).toStrictEqual([
			{ field: 'title', kind: 'set', value: 'stored' },
		])
		expect(resolved.query).toBe(updateOperation.query)
		expect(handler).toHaveBeenCalledOnce()

		const unchanged = await stages.preparedOperationHooks({
			context,
			operation: updateOperation,
			target: null,
		})
		expect(unchanged).toBe(updateOperation)
		expect(handler).toHaveBeenCalledOnce()
	})

	it('rejects prepared transformers that alter the target or update shape', async () => {
		const invalidReplacements = [
			{
				...updateOperation,
				query: new QueryBuilder(articleSchema).where((where) =>
					where.eq('id', 'article-2'),
				).ast,
			},
			{
				...updateOperation,
				update: {
					kind: 'update-expression',
					operations: [{ field: 'other', kind: 'set', value: 'changed' }],
				},
			},
		] as const

		for (const [index, replacement] of invalidReplacements.entries()) {
			const plugin = definePlugin({
				version: '0.0.0',
				core: '^0.0.0',
				pluginId: `fixture.invalid-prepared-${String(index)}`,
				privileges: [
					{
						name: 'runtime:intercept',
						reason: 'Registers low-level Runtime hooks for tests.',
					},
				],
				setup: ({ runtime }) => {
					runtime.register(
						'fixture.invalid-prepared',
						preparedOperation({
							schema: articleSchema,
							handler: () => ({ operation: replacement }),
						}),
					)
				},
			})
			const application = await createApplication({
				plugins: [plugin],
				schemas: [articleSchema],
			})

			await expect(
				createRuntimeHookStages(application).preparedOperationHooks({
					context,
					operation: updateOperation,
					target: updateTarget,
				}),
			).rejects.toThrow(/prepared-operation hook/u)
		}
	})
})
