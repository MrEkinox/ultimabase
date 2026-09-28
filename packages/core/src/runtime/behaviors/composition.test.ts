import { applicationFixture } from '../../../tests/application-fixture.js'
import { createApplication } from '../../application/framework-application.js'
import { plugin as createPlugin } from '../../plugins/plugin.js'
import { readApplicationPluginOwner } from '../../plugins/callback-execution.js'
import { QueryBuilder, type CreateOneOperationAst } from '../../query/index.js'
import { Schema } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { provideRuntimeBehavior } from '../capabilities.js'
import { RequestContext, requestSources } from '../context/request-context.js'
import type { RuntimeFinalMutationGuardStage } from '../pipeline/contracts.js'
import { composeRuntimeBehaviors } from './composition.js'

const context = RequestContext.anonymous({
	requestId: 'runtime-behavior-composition',
	source: requestSources.internal,
})

const createGuardPlugin = (
	pluginId: string,
	guardMutationInput: RuntimeFinalMutationGuardStage,
) =>
	createPlugin({
		core: '^0.0.0',
		id: pluginId,
		version: '0.0.0',
		permissions: {
			'runtime:intercept':
				'Guards final mutation input in a composition fixture.',
		},
		contributions: [
			provideRuntimeBehavior({
				contributionId: 'final-mutation-guard',
				create: () => ({ value: { guardMutationInput } }),
			}),
		],
	})

describe('generic Runtime behavior composition', () => {
	it('allocates no behavior bundle when no plugin provides one', async () => {
		const Post = Schema.define({
			className: 'NoRuntimeBehaviorPost',
			fields: (field) => ({ title: field.string() }),
		})
		const application = applicationFixture(
			await createApplication({
				plugins: [],
				schemas: [Post],
			}),
		)

		expect(composeRuntimeBehaviors(application)).toBeUndefined()
		await application.dispose()
	})

	it('runs final mutation guards in plugin order with exact attribution', async () => {
		const Post = Schema.define({
			className: 'OrderedRuntimeGuardPost',
			fields: (field) => ({ title: field.string() }),
		})
		const calls: string[] = []
		const first = createGuardPlugin('fixture.runtime-guard-first', () => {
			calls.push(readApplicationPluginOwner(application)?.pluginId ?? 'missing')
		})
		const second = createGuardPlugin('fixture.runtime-guard-second', () => {
			calls.push(readApplicationPluginOwner(application)?.pluginId ?? 'missing')
		})
		const application = applicationFixture(
			await createApplication({
				pluginPrivileges: { logger: false },
				plugins: [first, second],
				schemas: [Post],
			}),
		)
		const operation: CreateOneOperationAst<typeof Post> = {
			input: { title: 'guarded' },
			kind: 'create-one',
			selection: new QueryBuilder(Post).ast.selection,
			schema: new QueryBuilder(Post).ast.schema,
		}

		await composeRuntimeBehaviors(application)?.guardMutationInput?.({
			context,
			operation,
			target: undefined,
		})

		expect(calls).toStrictEqual([
			'fixture.runtime-guard-first',
			'fixture.runtime-guard-second',
		])
		await application.dispose()
	})

	it('stops composed mutation guards at the first rejection', async () => {
		const Post = Schema.define({
			className: 'RejectingRuntimeGuardPost',
			fields: (field) => ({ title: field.string() }),
		})
		const calls: string[] = []
		const first = createGuardPlugin('fixture.runtime-guard-rejecting', () => {
			calls.push('rejecting')
			throw new TypeError('Mutation input rejected')
		})
		const second = createGuardPlugin('fixture.runtime-guard-skipped', () => {
			calls.push('skipped')
		})
		const application = applicationFixture(
			await createApplication({
				pluginPrivileges: { logger: false },
				plugins: [first, second],
				schemas: [Post],
			}),
		)
		const operation: CreateOneOperationAst<typeof Post> = {
			input: { title: 'guarded' },
			kind: 'create-one',
			selection: new QueryBuilder(Post).ast.selection,
			schema: new QueryBuilder(Post).ast.schema,
		}

		await expect(
			composeRuntimeBehaviors(application)?.guardMutationInput?.({
				context,
				operation,
				target: undefined,
			}),
		).rejects.toThrow('Mutation input rejected')
		expect(calls).toStrictEqual(['rejecting'])
		await application.dispose()
	})

	it('isolates final mutation guard resources by application', async () => {
		const Post = Schema.define({
			className: 'IsolatedRuntimeGuardPost',
			fields: (field) => ({ title: field.string() }),
		})
		let nextId = 0
		const calls: number[] = []
		const disposals: number[] = []
		const plugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.runtime-guard-isolation',
			version: '0.0.0',
			permissions: {
				'runtime:intercept': 'Exercises application-local guard resources.',
			},
			contributions: [
				provideRuntimeBehavior({
					contributionId: 'isolated-final-mutation-guard',
					create: () => {
						const id = ++nextId
						return {
							value: {
								guardMutationInput: () => {
									calls.push(id)
								},
							},
							dispose: () => {
								disposals.push(id)
							},
						}
					},
				}),
			],
		})
		const first = applicationFixture(
			await createApplication({
				pluginPrivileges: { logger: false },
				plugins: [plugin],
				schemas: [Post],
			}),
		)

		const operation: CreateOneOperationAst<typeof Post> = {
			input: { title: 'guarded' },
			kind: 'create-one',
			selection: new QueryBuilder(Post).ast.selection,
			schema: new QueryBuilder(Post).ast.schema,
		}

		await composeRuntimeBehaviors(first)?.guardMutationInput?.({
			context,
			operation,
			target: undefined,
		})
		await first.dispose()
		expect(disposals).toStrictEqual([1])
		const second = applicationFixture(
			await createApplication({
				pluginPrivileges: { logger: false },
				plugins: [plugin],
				schemas: [Post],
			}),
		)
		await composeRuntimeBehaviors(second)?.guardMutationInput?.({
			context,
			operation,
			target: undefined,
		})
		expect(calls).toStrictEqual([1, 2])

		await second.dispose()
		expect(disposals).toStrictEqual([1, 2])
	})
})
