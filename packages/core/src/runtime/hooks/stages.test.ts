import {
	FrameworkApplication,
	createApplication,
	definePlugin,
} from '../../foundation.js'
import { QueryBuilder } from '../../query/index.js'
import { Schema, stringField } from '../../schema/index.js'
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
	fields: { title: stringField({ validation: { required: true } }) },
})

const foreignSchema = Schema.define({
	className: 'HookStageForeign',
	fields: { title: stringField({ validation: { required: true } }) },
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
			new TypeError('Application contributions require completed plugin setup'),
		)
		await application.dispose()
	})

	it('rejects values not created by Runtime contribution factories', async () => {
		const plugin = definePlugin({
			name: 'fixture.invalid-hook',
			setup: ({ registries }) => {
				registries.hooks.register('fixture.invalid', () => undefined)
			},
		})
		const application = await createApplication({
			schemas: [articleSchema],
			plugins: [plugin],
		})

		expect(() => createRuntimeHookStages(application)).toThrow(
			new TypeError(
				'Plugin "fixture.invalid-hook" registered invalid runtime hooks contribution "fixture.invalid"',
			),
		)
	})

	it('rejects contribution kinds registered in the wrong Core category', async () => {
		const eventInHooks = definePlugin({
			name: 'fixture.event-in-hooks',
			setup: ({ registries }) => {
				registries.hooks.register(
					'fixture.wrong-event',
					postCommitEvent({ handler: () => undefined }),
				)
			},
		})
		const hookInEvents = definePlugin({
			name: 'fixture.hook-in-events',
			setup: ({ registries }) => {
				registries.events.register(
					'fixture.wrong-hook',
					beforeOperation({
						handler: (input) => ({ operation: input.operation }),
					}),
				)
			},
		})

		for (const plugin of [eventInHooks, hookInEvents]) {
			const application = await createApplication({
				schemas: [articleSchema],
				plugins: [plugin],
			})

			expect(() => createRuntimeHookStages(application)).toThrow(
				/wrong registry/u,
			)
		}
	})

	it('rejects schema scopes outside the owning application', async () => {
		const plugin = definePlugin({
			name: 'fixture.foreign-hook',
			setup: ({ registries }) => {
				registries.hooks.register(
					'fixture.foreign',
					beforeOperation({
						schema: foreignSchema,
						handler: (input) => ({ operation: input.operation }),
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

	it('requires explicit before and after transformation wrappers', async () => {
		const plugin = definePlugin({
			name: 'fixture.invalid-output',
			setup: ({ registries }) => {
				registries.hooks.register(
					'fixture.invalid-before-output',
					beforeOperation({
						operations: ['create-one'],
						handler: ((input: RuntimeOperationStageInput<typeof operation>) =>
							input.operation) as never,
					}),
				)
				registries.hooks.register(
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
			new TypeError('runtime hook must return exactly { operation }'),
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

	it('prevents before-hooks from changing terminal kind or schema identity', async () => {
		const createStages = async (
			replacement: CreateOneOperationAst<typeof articleSchema> | object,
		) => {
			const plugin = definePlugin({
				name: 'fixture.replacement',
				setup: ({ registries }) => {
					registries.hooks.register(
						'fixture.replacement',
						beforeOperation({
							operations: ['create-one'],
							handler: (() => ({ operation: replacement })) as never,
						}),
					)
				},
			})
			const application = await createApplication({
				schemas: [articleSchema, foreignSchema],
				plugins: [plugin],
			})

			return createRuntimeHookStages(application)
		}
		const kindStages = await createStages({ ...operation, kind: 'count' })
		const foreignOperation: CreateOneOperationAst<typeof articleSchema> = {
			...operation,
			schema: new QueryBuilder(foreignSchema).ast.schema as never,
		}
		const schemaStages = await createStages(foreignOperation)

		await expect(
			kindStages.globalBeforeHooks({ context, operation }),
		).rejects.toThrow(
			new TypeError('before-operation hook must preserve operation kind'),
		)
		await expect(
			schemaStages.globalBeforeHooks({ context, operation }),
		).rejects.toThrow(
			new TypeError('before-operation hook must preserve schema identity'),
		)
	})

	it('prevents low-level before-hooks from changing query result shape', async () => {
		const replacement: UpdateOneOperationAst<typeof articleSchema> = {
			...updateOperation,
			query: new QueryBuilder(articleSchema)
				.where((where) => where.eq('id', 'article-1'))
				.select({ title: true }).ast,
		}
		const plugin = definePlugin({
			name: 'fixture.query-shape-replacement',
			setup: ({ registries }) => {
				registries.hooks.register(
					'fixture.query-shape-replacement',
					beforeOperation({
						operations: ['update-one'],
						handler: (() => ({ operation: replacement })) as never,
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
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			publicMessage: 'A hook returned an invalid value.',
		})
	})

	it('resolves only update values against one locked singular target', async () => {
		const handler = vi.fn()
		const plugin = definePlugin({
			name: 'fixture.prepared-value',
			setup: ({ registries }) => {
				registries.hooks.register(
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
				name: `fixture.invalid-prepared-${String(index)}`,
				setup: ({ registries }) => {
					registries.hooks.register(
						'fixture.invalid-prepared',
						preparedOperation({
							schema: articleSchema,
							handler: (() => ({ operation: replacement })) as never,
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
