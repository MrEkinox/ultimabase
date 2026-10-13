import { applicationFixture } from '../../../tests/application-fixture.js'
import { plugin as createPlugin } from '../../plugins/plugin.js'
import {
	createApplication,
	FrameworkApplication,
} from '../../application/framework-application.js'

import { describe, expect, it, vi } from 'vitest'
import { provideTestRuntimeInterceptor } from '../../../tests/runtime/fixtures/runtime-capabilities.js'

import { RequestContext, requestSources } from '../context/request-context.js'
import type { UpdateOneOperationAst } from '../../query/index.js'
import { preparedOperation } from './definitions.js'
import { composeRuntimeContributionBehavior } from './composition.js'
import { UltimaBase } from '../application/ultima-base.js'
import { QueryBuilder } from '../../plugin.js'

const articleSchema = UltimaBase.Schema.define({
	className: 'ContributionStageArticle',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
})

const foreignSchema = UltimaBase.Schema.define({
	className: 'ContributionStageForeign',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
})

const context = RequestContext.anonymous({
	requestId: 'contribution-stage-1',
	source: requestSources.internal,
})

const updateOperation: UpdateOneOperationAst<typeof articleSchema> = {
	kind: 'update-one',
	query: new QueryBuilder(articleSchema).where((where) =>
		where.eq('id', '00000000-0000-7000-8000-000000000001'),
	).ast,
	update: {
		kind: 'update-expression',
		operations: [{ field: 'title', kind: 'set', value: 'input' }],
	},
}

const updateTarget = Object.freeze({
	createdAt: '2026-08-01T00:00:00.000Z',
	id: '00000000-0000-7000-8000-000000000001',
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
					preparedOperation({
						schema: foreignSchema,
						handler: ({ operation }) => ({ operation }),
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
					where.eq('id', '00000000-0000-7000-8000-000000000002'),
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
							// @ts-expect-error -- Runtime rejects deliberately invalid interceptor replacements.
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
