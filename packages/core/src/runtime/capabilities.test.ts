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
	decorateCapability,
	optionalCapability,
	provideCapability,
	replaceCapability,
} from '../plugins/capabilities.js'
import { RequestContext, requestSources } from './context/request-context.js'
import { runWithRequestEngine } from './context/active-framework-context.js'
import { beforeOperation } from './contributions/definitions.js'
import { guard } from './enforcement/definitions.js'
import { composeRuntimeContributionBehavior } from './contributions/composition.js'
import { RuntimePipeline } from './pipeline/runtime-pipeline.js'
import { createFrameworkEngine } from './application/create-framework-engine.js'
import {
	canonicalRuntimeExecutorTarget,
	provideRuntimeConstraint,
	provideRuntimeInterceptor,
	replaceRuntime,
	runtimeConstraintCapability,
	runtimeExecutorCapability,
	runtimeInterceptorCapability,
	runtimeObserverCapability,
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
	new FrameworkApplication({
		pluginPrivileges: { logger: false },
		plugins: [plugin],
		schemas: [runtimeSchema],
	})

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
		expect(runtimeExecutorCapability).toMatchObject({
			capabilityId: 'ultimabase.runtime-executor',
			cardinality: 'single',
			lifetime: 'application',
			version: '1.0.0',
		})
		expect(runtimeInterceptorCapability.cardinality).toBe('pipeline')
		expect(runtimeConstraintCapability.cardinality).toBe('multiple')
		expect(runtimeObserverCapability.cardinality).toBe('multiple')
		expect(canonicalRuntimeExecutorTarget).toStrictEqual({
			contributionId: 'canonical-runtime-executor',
			owner: { pluginId: '@ultimabase/core' },
		})
	})

	it('installs no neutral Runtime contribution when no plugin provides one', () => {
		const runtimeCapabilities = new PluginGraph(
			normalizePlugins([]),
		).capabilities.entries
			.map(({ token }) => token.capabilityId)
			.filter((capabilityId) => capabilityId.startsWith('ultimabase.runtime-'))

		expect(runtimeCapabilities).toStrictEqual(['ultimabase.runtime-executor'])
	})

	it('rejects missing privileges and generic Runtime capability facades', () => {
		const definition = beforeOperation({ handler: () => undefined })
		const missingPrivilege = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.runtime-missing-privilege',
			version: '0.0.0',
			capabilities: {
				provides: [
					provideRuntimeInterceptor({
						contributionId: 'interceptor',
						create: () => ({ value: definition }),
					}),
				],
			},
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
			capabilities: {
				provides: [
					provideCapability(runtimeInterceptorCapability, {
						contributionId: 'generic',
						create: () => ({ value: definition }),
					}),
				],
			},
		})
		expect(
			captureFrameworkError(() => createPluginApplication(genericProvider))
				.internalDetails,
		).toMatchObject({ kind: 'runtime-capability-provider-factory' })

		const genericExecutor = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.runtime-generic-executor',
			version: '0.0.0',
			capabilities: {
				provides: [
					provideCapability(runtimeExecutorCapability, {
						contributionId: 'generic-executor',
						create: () => ({
							value: (stages) => new RuntimePipeline(stages),
						}),
					}),
				],
			},
		})
		expect(
			captureFrameworkError(() => createPluginApplication(genericExecutor))
				.internalDetails,
		).toMatchObject({ kind: 'runtime-executor-provider-forbidden' })
	})

	it('requires replaceRuntime and the critical runtime replacement privilege', () => {
		const genericReplacement = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.runtime-generic-replacement',
			version: '0.0.0',
			privileges: [
				{
					name: 'runtime:replace',
					reason: 'Exercises replacement validation.',
				},
			],
			capabilities: {
				replaces: [
					replaceCapability(runtimeExecutorCapability, {
						contributionId: 'generic-replacement',
						target: canonicalRuntimeExecutorTarget,
						create: () => ({
							value: (stages) => new RuntimePipeline(stages),
						}),
					}),
				],
			},
		})
		expect(
			captureFrameworkError(() => createPluginApplication(genericReplacement))
				.internalDetails,
		).toMatchObject({ kind: 'runtime-replacement-factory' })

		const missingPrivilege = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.runtime-replacement-no-privilege',
			version: '0.0.0',
			capabilities: {
				replaces: [
					replaceRuntime({
						contributionId: 'replacement',
						create: () => ({
							value: (stages) => new RuntimePipeline(stages),
						}),
					}),
				],
			},
		})
		expect(
			captureFrameworkError(() => createPluginApplication(missingPrivilege))
				.internalDetails,
		).toMatchObject({
			kind: 'capability-privilege-missing',
			privilege: 'runtime:replace',
		})
	})

	it('forbids generic decoration of protected Runtime protocols', () => {
		const plugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.runtime-decorator',
			version: '0.0.0',
			privileges: [
				{
					name: 'capability:decorate',
					reason: 'Exercises protected Runtime decoration.',
				},
			],
			capabilities: {
				decorates: [
					decorateCapability(runtimeExecutorCapability, {
						contributionId: 'decorator',
						decorate: (executor) => executor,
					}),
				],
			},
		})
		expect(
			captureFrameworkError(() => createPluginApplication(plugin))
				.internalDetails,
		).toMatchObject({ kind: 'runtime-capability-decoration-forbidden' })
	})

	it('forbids generic replacement and inspection of protected Runtime protocols', () => {
		const definition = guard({ handler: () => undefined })
		const replacingPlugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.runtime-constraint-replacement',
			version: '0.0.0',
			privileges: [
				{ name: 'runtime:constrain', reason: 'Provides the protected guard.' },
				{
					name: 'capability:replace',
					reason: 'Exercises protected replacement rejection.',
				},
			],
			capabilities: {
				provides: [
					provideRuntimeConstraint({
						contributionId: 'guard',
						create: () => ({ value: definition }),
					}),
				],
				replaces: [
					replaceCapability(runtimeConstraintCapability, {
						contributionId: 'replacement',
						target: {
							owner: { pluginId: 'fixture.runtime-constraint-replacement' },
							contributionId: 'guard',
						},
						create: () => ({ value: definition }),
					}),
				],
			},
		})
		expect(
			captureFrameworkError(() => createPluginApplication(replacingPlugin))
				.internalDetails,
		).toMatchObject({ kind: 'runtime-capability-replacement-forbidden' })

		const inspectingPlugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.runtime-constraint-inspection',
			version: '0.0.0',
			capabilities: {
				optional: [optionalCapability(runtimeConstraintCapability, '^1.0.0')],
			},
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
			capabilities: {
				provides: [
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
			},
		})
		const first = createPluginApplication(plugin)
		const second = createPluginApplication(plugin)
		await Promise.all([first.initialize(), second.initialize()])

		const context = RequestContext.anonymous({
			requestId: 'runtime-resource',
			source: requestSources.internal,
		})
		await composeRuntimeContributionBehavior(first)?.beforeOperation?.({
			context,
			operation: runtimeOperation,
		})
		await composeRuntimeContributionBehavior(second)?.beforeOperation?.({
			context,
			operation: runtimeOperation,
		})
		expect(invocations).toStrictEqual([1, 2])

		await first.dispose()
		expect(disposals).toStrictEqual([1])
		await second.dispose()
		expect(disposals).toStrictEqual([1, 2])
	})

	it('runs a replacement behind cancellation and automatic transaction boundaries', async () => {
		let replacementCalls = 0
		const adapter = new RecordingDatabaseAdapter([], [])
		const replacement = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.runtime-replacement',
			version: '0.0.0',
			privileges: [
				{ name: 'runtime:replace', reason: 'Exercises Runtime replacement.' },
			],
			capabilities: {
				replaces: [
					replaceRuntime({
						contributionId: 'replacement',
						create: () => ({
							value: (stages) => {
								replacementCalls += 1
								return new RuntimePipeline(stages)
							},
						}),
					}),
				],
			},
		})
		const database = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.runtime-database',
			version: '0.0.0',
			capabilities: { provides: [provideTestDatabaseAdapter(adapter)] },
		})
		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [replacement, database],
			schemas: [runtimeSchema],
		})
		const framework = createFrameworkEngine(application)
		const controller = new AbortController()
		controller.abort()
		const request = framework.anonymous({
			requestId: 'replacement-cancelled',
			signal: controller.signal,
			source: requestSources.internal,
		})

		await expect(
			runWithRequestEngine(request, () =>
				runtimeSchema.createOne({ data: { title: 'blocked' } }),
			),
		).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
		expect(replacementCalls).toBe(1)
		expect(adapter.transactions).toStrictEqual([])

		await application.dispose()
	})

	it('rejects a malformed executor result during framework assembly', async () => {
		const replacement = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.runtime-malformed-replacement',
			version: '0.0.0',
			privileges: [
				{ name: 'runtime:replace', reason: 'Exercises malformed replacement.' },
			],
			capabilities: {
				replaces: [
					replaceRuntime({
						contributionId: 'malformed',
						create: () => ({ value: (() => ({})) as never }),
					}),
				],
			},
		})
		const database = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.runtime-malformed-database',
			version: '0.0.0',
			capabilities: {
				provides: [
					provideTestDatabaseAdapter(new RecordingDatabaseAdapter([], [])),
				],
			},
		})
		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [replacement, database],
			schemas: [runtimeSchema],
		})

		expect(() => createFrameworkEngine(application)).toThrow(
			new TypeError(
				'Runtime executor factory must return a RuntimePipeline instance',
			),
		)
		await application.dispose()
	})
})
