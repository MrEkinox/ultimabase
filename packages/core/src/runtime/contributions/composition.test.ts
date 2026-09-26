import { applicationFixture } from '../../../tests/application-fixture.js'
import {
	FrameworkApplication,
	createApplication,
	plugin as createPlugin,
} from '../../foundation.js'
import { QueryBuilder } from '../../query/index.js'
import { Schema } from '../../schema/index.js'
import { describe, expect, it, vi } from 'vitest'
import { provideTestRuntimeInterceptor } from '../../../tests/runtime/fixtures/runtime-capabilities.js'

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
	preparedOperation,
} from './definitions.js'
import { composeRuntimeContributionBehavior } from './composition.js'

const articleSchema = Schema.define({
	className: 'ContributionStageArticle',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
})

const foreignSchema = Schema.define({
	className: 'ContributionStageForeign',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
})

const context = RequestContext.anonymous({
	requestId: 'contribution-stage-1',
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

describe('composeRuntimeContributionBehavior', () => {
	it('returns no behavior when the application has no Runtime contributions', async () => {
		const application = applicationFixture(
			await createApplication({
				plugins: [],
				schemas: [articleSchema],
			}),
		)

		expect(composeRuntimeContributionBehavior(application)).toBeUndefined()

		await application.dispose()
	})

	it('requires an initialized FrameworkApplication', async () => {
		expect(() => composeRuntimeContributionBehavior({} as never)).toThrow(
			new TypeError(
				'Runtime contribution composition requires a FrameworkApplication',
			),
		)

		const application = applicationFixture(
			new FrameworkApplication({
				schemas: [articleSchema],
				plugins: [],
			}),
		)

		expect(() => composeRuntimeContributionBehavior(application)).toThrow(
			new TypeError(
				'Application capabilities require completed materialization',
			),
		)
		await application.dispose()
	})

	it('rejects values not created by Runtime contribution factories', async () => {
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.invalid-contribution',
			permissions: {
				'runtime:intercept': 'Exercises malformed interceptor materialization.',
			},
			contributions: [
				provideTestRuntimeInterceptor(
					'fixture.invalid',
					(() => undefined) as never,
				),
			],
		})
		await expect(
			createApplication({
				schemas: [articleSchema],
				plugins: [plugin],
			}),
		).rejects.toThrow(
			new TypeError(
				'runtime interceptor factories must return a definition created by an interceptor factory',
			),
		)
	})

	it('rejects schema scopes outside the owning application', async () => {
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.foreign-contribution',
			permissions: {
				'runtime:intercept':
					'Registers low-level Runtime contributions for tests.',
			},
			contributions: [
				provideTestRuntimeInterceptor(
					'fixture.foreign',
					beforeOperation({
						schema: foreignSchema,
						handler: () => undefined,
					}),
				),
			],
		})
		const application = applicationFixture(
			await createApplication({
				schemas: [articleSchema],
				plugins: [plugin],
			}),
		)

		expect(() => composeRuntimeContributionBehavior(application)).toThrow(
			new TypeError(
				'Runtime contribution "fixture.foreign" references a schema outside its application',
			),
		)
	})

	it('requires before observers to return nothing and exact after replacements', async () => {
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.invalid-output',
			permissions: {
				'runtime:intercept':
					'Registers low-level Runtime contributions for tests.',
			},
			contributions: [
				provideTestRuntimeInterceptor(
					'fixture.invalid-before-output',
					beforeOperation({
						operations: ['create-one'],
						handler: ((input: RuntimeOperationStageInput<typeof operation>) =>
							input.operation) as never,
					}),
				),
				provideTestRuntimeInterceptor(
					'fixture.invalid-after-output',
					afterOperation({
						operations: ['create-one'],
						handler: ((input: RuntimeResultStageInput<typeof operation>) => ({
							result: input.result,
							extra: true,
						})) as never,
					}),
				),
			],
		})
		const application = applicationFixture(
			await createApplication({
				schemas: [articleSchema],
				plugins: [plugin],
			}),
		)
		const stages = composeRuntimeContributionBehavior(application)
		if (stages === undefined) throw new TypeError('Expected Runtime behavior')

		await expect(
			stages.beforeOperation?.({ context, operation }),
		).rejects.toThrow(
			new TypeError('before-operation contribution must return undefined'),
		)
		await expect(
			stages.transformResult?.({
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
			new TypeError('Runtime contribution must return exactly { result }'),
		)
	})

	it('preserves global and schema interceptor stage order', async () => {
		const calls: string[] = []
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.ordered-contributions',
			permissions: {
				'runtime:intercept': 'Exercises Runtime interceptor ordering.',
			},
			contributions: [
				provideTestRuntimeInterceptor(
					'fixture.global-after',
					afterOperation({
						handler: ({ result }) => {
							calls.push('global-after')
							return { result }
						},
					}),
				),
				provideTestRuntimeInterceptor(
					'fixture.schema-before',
					beforeOperation({
						schema: articleSchema,
						handler: () => {
							calls.push('schema-before')
						},
					}),
				),
				provideTestRuntimeInterceptor(
					'fixture.global-before',
					beforeOperation({
						handler: () => {
							calls.push('global-before')
						},
					}),
				),
				provideTestRuntimeInterceptor(
					'fixture.schema-after',
					afterOperation({
						schema: articleSchema,
						handler: ({ result }) => {
							calls.push('schema-after')
							return { result }
						},
					}),
				),
			],
		})
		const application = applicationFixture(
			await createApplication({
				plugins: [plugin],
				schemas: [articleSchema],
			}),
		)
		const stages = composeRuntimeContributionBehavior(application)
		if (stages === undefined) throw new TypeError('Expected Runtime behavior')
		const result = { ...updateTarget }

		await stages.beforeOperation?.({ context, operation })
		await stages.transformResult?.({ context, operation, result })

		expect(calls).toStrictEqual([
			'global-before',
			'schema-before',
			'schema-after',
			'global-after',
		])
		await application.dispose()
	})

	it('rejects every attempted low-level before-operation replacement', async () => {
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.before-replacement',
			permissions: {
				'runtime:intercept':
					'Registers low-level Runtime contributions for tests.',
			},
			contributions: [
				provideTestRuntimeInterceptor(
					'fixture.before-replacement',
					beforeOperation({
						operations: ['update-one'],
						handler: ((
							input: RuntimeOperationStageInput<typeof updateOperation>,
						) => ({
							operation: input.operation,
						})) as never,
					}),
				),
			],
		})
		const application = applicationFixture(
			await createApplication({
				plugins: [plugin],
				schemas: [articleSchema],
			}),
		)
		const stages = composeRuntimeContributionBehavior(application)
		if (stages === undefined) throw new TypeError('Expected Runtime behavior')

		await expect(
			stages.beforeOperation?.({ context, operation: updateOperation }),
		).rejects.toThrow(
			new TypeError('before-operation contribution must return undefined'),
		)
	})

	it('resolves only update values against one locked singular target', async () => {
		const handler = vi.fn()
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.prepared-value',
			permissions: {
				'runtime:intercept':
					'Registers low-level Runtime contributions for tests.',
			},
			contributions: [
				provideTestRuntimeInterceptor(
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
				),
			],
		})
		const application = applicationFixture(
			await createApplication({
				plugins: [plugin],
				schemas: [articleSchema],
			}),
		)
		const stages = composeRuntimeContributionBehavior(application)
		if (stages === undefined) throw new TypeError('Expected Runtime behavior')
		const transformPreparedOperation = stages.transformPreparedOperation
		if (transformPreparedOperation === undefined) {
			throw new TypeError('Expected a prepared-operation transform')
		}
		const resolved = await transformPreparedOperation({
			context,
			operation: updateOperation,
			target: updateTarget,
		})

		expect(resolved.update.operations).toStrictEqual([
			{ field: 'title', kind: 'set', value: 'stored' },
		])
		expect(resolved.query).toBe(updateOperation.query)
		expect(handler).toHaveBeenCalledOnce()

		const unchanged = await transformPreparedOperation({
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
			const plugin = createPlugin({
				version: '0.0.0',
				core: '^0.0.0',
				id: `fixture.invalid-prepared-${String(index)}`,
				permissions: {
					'runtime:intercept':
						'Registers low-level Runtime contributions for tests.',
				},
				contributions: [
					provideTestRuntimeInterceptor(
						'fixture.invalid-prepared',
						preparedOperation({
							schema: articleSchema,
							handler: () => ({ operation: replacement }),
						}),
					),
				],
			})
			const application = applicationFixture(
				await createApplication({
					plugins: [plugin],
					schemas: [articleSchema],
				}),
			)

			await expect(
				composeRuntimeContributionBehavior(
					application,
				)?.transformPreparedOperation?.({
					context,
					operation: updateOperation,
					target: updateTarget,
				}),
			).rejects.toThrow(/prepared-operation contribution/u)
			await application.dispose()
		}
	})
})
