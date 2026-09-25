import { applicationFixture } from '../../tests/application-fixture.js'
import { describe, expect, it } from 'vitest'

import {
	FrameworkApplication,
	FrameworkError,
	createApplication,
} from '../foundation.js'
import { QueryBuilder } from '../query/index.js'
import { Schema } from '../schema/index.js'
import { definePlugin } from '../plugins/definition.js'
import { PluginGraph } from '../plugins/graph.js'
import { normalizePlugins } from '../plugins/normalization.js'
import {
	optionalCapability,
	provideCapability,
} from '../plugins/capabilities.js'
import { RequestContext, requestSources } from './context/request-context.js'
import { runWithRequestEngine } from './context/active-framework-context.js'
import { beforeOperation } from './contributions/definitions.js'
import { composeRuntimeContributionBehavior } from './contributions/composition.js'
import { createFrameworkEngine } from './application/create-framework-engine.js'
import {
	provideRuntimeBehavior,
	provideRuntimeInterceptor,
	runtimeBehaviorCapability,
	runtimeConstraintCapability,
	runtimeInterceptorCapability,
} from './capabilities.js'
import { RecordingDatabaseAdapter } from '../../tests/runtime/fixtures/recording-database-adapter.js'
import { provideTestDatabaseAdapter } from '../../tests/runtime/fixtures/database-adapter-capability.js'

const runtimeSchema = Schema.define({
	className: 'RuntimeCapabilityArticle',
	fields: (field) => ({ title: field.string() }),
})

const runtimeOperation = {
	kind: 'find-many',
	query: new QueryBuilder(runtimeSchema).ast,
} as const

const createPluginApplication = (plugin: ReturnType<typeof definePlugin>) =>
	applicationFixture(
		new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [plugin],
			schemas: [runtimeSchema],
		}),
	)

interface CapturedFrameworkError {
	readonly code: unknown
	readonly internalDetails: unknown
}

const captureFrameworkError = (
	operation: () => unknown,
): CapturedFrameworkError => {
	try {
		operation()
	} catch (error: unknown) {
		if (error instanceof FrameworkError) {
			return { code: error.code, internalDetails: error.internalDetails }
		}
		throw error
	}

	throw new TypeError('Expected a FrameworkError')
}

describe('public Runtime capabilities', () => {
	it('declares distinct versioned cardinalities behind application lifetime', () => {
		expect(runtimeBehaviorCapability.version).toBe('3.0.0')
		expect(runtimeInterceptorCapability.cardinality).toBe('pipeline')
		expect(runtimeConstraintCapability.cardinality).toBe('multiple')
	})

	it('installs no neutral Runtime contribution when no plugin provides one', () => {
		const runtimeCapabilities = new PluginGraph(
			normalizePlugins([]),
		).capabilities.entries
			.map(({ token }) => token.capabilityId)
			.filter((capabilityId) => capabilityId.startsWith('ultimabase.runtime-'))

		expect(runtimeCapabilities).toStrictEqual([])
	})

	it('rejects missing privileges and generic Runtime capability facades', () => {
		const definition = beforeOperation({ handler: () => undefined })
		const missingPrivilege = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.runtime-missing-privilege',
			version: '0.0.0',
			capabilities: [
				provideRuntimeInterceptor({
					contributionId: 'interceptor',
					create: () => ({ value: definition }),
				}),
			],
		})
		const missingPrivilegeError = captureFrameworkError(() =>
			createPluginApplication(missingPrivilege),
		)
		expect(missingPrivilegeError.code).toBe('PLUGIN_CAPABILITY_CONFLICT')
		expect(missingPrivilegeError.internalDetails).toMatchObject({
			kind: 'capability-privilege-missing',
			privilege: 'runtime:intercept',
		})

		const genericProvider = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.runtime-generic-provider',
			version: '0.0.0',
			privileges: [
				{ name: 'runtime:intercept', reason: 'Exercises exact facades.' },
			],
			capabilities: [
				provideCapability(runtimeInterceptorCapability, {
					contributionId: 'generic',
					create: () => ({ value: definition }),
				}),
			],
		})
		expect(
			captureFrameworkError(() => createPluginApplication(genericProvider))
				.internalDetails,
		).toMatchObject({ kind: 'runtime-capability-provider-factory' })
	})

	it.each(['normalization', 'commit'] as const)(
		'rejects a forged former %s stage before plugin setup',
		async (stage) => {
			const effects: string[] = []
			const plugin = definePlugin({
				core: '^0.0.0',
				pluginId: 'fixture.removed-runtime-stage',
				version: '0.0.0',
				privileges: [
					{
						name: 'runtime:intercept',
						reason: 'Tests the removed stage boundary.',
					},
				],
				capabilities: [
					provideRuntimeInterceptor({
						contributionId: 'removed-stage',
						create: () => ({
							// Untyped plugins cannot restore a removed stage with a shaped object.
							value: {
								stage,
								handler: () => {
									effects.push('handler')
								},
							} as never,
						}),
					}),
				],
				setup: () => {
					effects.push('setup')
				},
			})
			const application = createPluginApplication(plugin)
			await expect(application.initialize()).rejects.toThrow(
				'runtime interceptor factories must return a definition created by an interceptor factory',
			)
			expect(effects).toStrictEqual([])
		},
	)

	it('requires Runtime interception privilege and validates mutation guards', async () => {
		const missingPrivilege = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.runtime-guard-no-privilege',
			version: '0.0.0',
			capabilities: [
				provideRuntimeBehavior({
					contributionId: 'final-mutation-guard',
					create: () => ({
						value: { guardMutationInput: () => undefined },
					}),
				}),
			],
		})
		expect(
			captureFrameworkError(() => createPluginApplication(missingPrivilege))
				.internalDetails,
		).toMatchObject({
			kind: 'capability-privilege-missing',
			privilege: 'runtime:intercept',
		})

		const malformed = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.runtime-guard-malformed',
			version: '0.0.0',
			privileges: [
				{
					name: 'runtime:intercept',
					reason: 'Exercises Runtime behavior validation.',
				},
			],
			capabilities: [
				provideRuntimeBehavior({
					contributionId: 'malformed-final-mutation-guard',
					create: () => ({
						value: { guardMutationInput: true } as never,
					}),
				}),
			],
		})

		await expect(
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [malformed],
				schemas: [runtimeSchema],
			}),
		).rejects.toThrow(
			new TypeError(
				'Runtime behavior stage guardMutationInput must be a function',
			),
		)
	})

	it('forbids inspection of protected Runtime protocols', () => {
		const inspectingPlugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.runtime-constraint-inspection',
			version: '0.0.0',
			capabilities: [optionalCapability(runtimeConstraintCapability, '^1.0.0')],
		})
		expect(
			captureFrameworkError(() => createPluginApplication(inspectingPlugin))
				.internalDetails,
		).toMatchObject({ kind: 'runtime-capability-requirement-forbidden' })
	})

	it('materializes, isolates, and cleans application interceptor resources', async () => {
		let nextId = 0
		const invocations: number[] = []
		const disposals: number[] = []
		const plugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.runtime-resource',
			version: '0.0.0',
			privileges: [
				{ name: 'runtime:intercept', reason: 'Exercises resource isolation.' },
			],
			capabilities: [
				provideRuntimeInterceptor({
					contributionId: 'resource',
					create: () => {
						const id = ++nextId
						return {
							value: beforeOperation({
								handler: () => {
									invocations.push(id)
								},
							}),
							dispose: () => {
								disposals.push(id)
							},
						}
					},
				}),
			],
		})
		const first = createPluginApplication(plugin)
		const second = createPluginApplication(plugin)
		await first.initialize()

		const context = RequestContext.anonymous({
			requestId: 'runtime-resource',
			source: requestSources.internal,
		})
		await composeRuntimeContributionBehavior(first)?.beforeOperation?.({
			context,
			operation: runtimeOperation,
		})
		await first.dispose()
		expect(disposals).toStrictEqual([1])
		await second.initialize()
		await composeRuntimeContributionBehavior(second)?.beforeOperation?.({
			context,
			operation: runtimeOperation,
		})
		expect(invocations).toStrictEqual([1, 2])

		await second.dispose()
		expect(disposals).toStrictEqual([1, 2])
	})

	it('keeps cancellation ahead of mutation guards and automatic transactions', async () => {
		let guardCalls = 0
		const adapter = new RecordingDatabaseAdapter([], [])
		const behavior = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.runtime-guard',
			version: '0.0.0',
			privileges: [
				{
					name: 'runtime:intercept',
					reason: 'Proves cancellation prevents mutation guards from running.',
				},
			],
			capabilities: [
				provideRuntimeBehavior({
					contributionId: 'final-mutation-guard',
					create: () => ({
						value: {
							guardMutationInput: () => {
								guardCalls += 1
							},
						},
					}),
				}),
			],
		})
		const database = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.runtime-database',
			version: '0.0.0',
			capabilities: [provideTestDatabaseAdapter(adapter)],
		})
		const application = applicationFixture(
			await createApplication({
				pluginPrivileges: { logger: false },
				plugins: [behavior, database],
				schemas: [runtimeSchema],
			}),
		)
		const framework = createFrameworkEngine(application)
		const controller = new AbortController()
		controller.abort()
		const request = framework.anonymous({
			requestId: 'cancelled',
			signal: controller.signal,
			source: requestSources.internal,
		})

		await expect(
			runWithRequestEngine(request, () =>
				runtimeSchema.createOne({ data: { title: 'blocked' } }),
			),
		).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
		expect(guardCalls).toBe(0)
		expect(adapter.transactions).toStrictEqual([])

		await application.dispose()
	})
})
