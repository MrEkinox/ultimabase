import { describe, expect, it } from 'vitest'

import { FrameworkApplication } from '../application/framework-application.js'
import { FrameworkError } from '../errors/framework-error.js'
import {
	defineCapability,
	optionalCapability,
	provideCapability,
	requireCapability,
} from './capabilities.js'
import { definePlugin } from './definition.js'
import { PluginGraph } from './graph.js'
import { normalizePlugins } from './normalization.js'

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

describe('capability composition', () => {
	it('keeps an absent optional declaration capability uncomposed', async () => {
		let composeCalls = 0
		const token = defineCapability<string>()({
			capabilityId: 'fixture.optional-declaration',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'declaration',
			compose: ([provider]) => {
				composeCalls += 1
				return provider
			},
		})
		const requirement = optionalCapability(token, '^1.0.0')
		let resolved: string | undefined = 'unread'
		const consumer = definePlugin({
			pluginId: 'fixture.optional-declaration-consumer',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: { optional: [requirement] },
			setup: ({ capabilities }) => {
				resolved = capabilities.get(requirement)
			},
		})
		const application = new FrameworkApplication({
			schemas: [],
			plugins: [consumer],
			pluginPrivileges: { logger: false },
		})

		await application.initialize()

		expect(composeCalls).toBe(0)
		expect(resolved).toBeUndefined()
	})

	it('composes declaration providers before setup', async () => {
		interface FormatProvider {
			readonly name: string
		}
		interface FormatConsumer {
			readonly render: () => string
		}
		const token = defineCapability<FormatProvider, FormatConsumer>()({
			capabilityId: 'fixture.composed-format',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'declaration',
			compose: ([provider]) => ({ render: () => provider.name }),
		})
		const requirement = requireCapability(token, '^1.0.0')
		const provider = definePlugin({
			pluginId: 'fixture.format-provider',
			instanceId: 'primary',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: {
				provides: [
					provideCapability(token, {
						contributionId: 'format',
						value: { name: 'original' },
					}),
				],
			},
		})
		let rendered: string | undefined
		const consumer = definePlugin({
			pluginId: 'fixture.format-consumer',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: { requires: [requirement] },
			setup: ({ capabilities }) => {
				rendered = capabilities.get(requirement).render()
			},
		})
		const application = new FrameworkApplication({
			schemas: [],
			plugins: [consumer, provider],
			pluginPrivileges: { logger: false },
		})

		await application.initialize()

		expect(rendered).toBe('original')
		expect(application.pluginPrivilegeReport.allowed).toBe(true)
	})

	it('preserves multiple provider positions in declaration order', async () => {
		const token = defineCapability<string, readonly string[]>()({
			capabilityId: 'fixture.multiple-values',
			version: '1.0.0',
			cardinality: 'multiple',
			lifetime: 'declaration',
			compose: (providers) => providers,
		})
		const requirement = requireCapability(token, '^1.0.0')
		const first = definePlugin({
			pluginId: 'fixture.multiple-first',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: {
				provides: [
					provideCapability(token, {
						contributionId: 'first',
						value: 'first',
					}),
				],
			},
		})
		const second = definePlugin({
			pluginId: 'fixture.multiple-second',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: {
				provides: [
					provideCapability(token, {
						contributionId: 'second',
						value: 'second',
					}),
				],
			},
		})
		let values: readonly string[] = []
		const consumer = definePlugin({
			pluginId: 'fixture.multiple-consumer',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: { requires: [requirement] },
			setup: ({ capabilities }) => {
				values = capabilities.get(requirement)
			},
		})
		const application = new FrameworkApplication({
			schemas: [],
			plugins: [consumer, first, second],
			pluginPrivileges: { logger: false },
		})

		await application.initialize()
		expect(values).toStrictEqual(['first', 'second'])
		await application.dispose()
	})

	it('materializes application dependencies before setup and disposes after owner hooks', async () => {
		const events: string[] = []
		interface Transport {
			readonly endpoint: string
		}
		const token = defineCapability<Transport>()({
			capabilityId: 'fixture.application-transport',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'application',
			compose: ([provider]) => provider,
		})
		const requirement = requireCapability(token, '^1.0.0')
		const provider = definePlugin({
			pluginId: 'fixture.application-provider',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: {
				provides: [
					provideCapability(token, {
						contributionId: 'primary',
						create: ({ schemas }) => {
							events.push(`create:${String(schemas.size)}`)
							void schemas.schemaTargets
							return {
								value: { endpoint: 'local' },
								dispose: () => {
									events.push('resource-dispose')
								},
							}
						},
					}),
				],
			},
			setup: () => {
				events.push('provider-setup')
			},
			hooks: {
				dispose: () => {
					events.push('provider-dispose')
				},
			},
		})
		const consumer = definePlugin({
			pluginId: 'fixture.application-consumer',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: { requires: [requirement] },
			setup: ({ capabilities }) => {
				events.push(`consumer-setup:${capabilities.get(requirement).endpoint}`)
			},
			hooks: {
				dispose: () => {
					events.push('consumer-dispose')
				},
			},
		})
		const application = new FrameworkApplication({
			schemas: [],
			plugins: [consumer, provider],
			pluginPrivileges: { logger: false },
		})

		await application.initialize()
		await application.dispose()

		expect(events).toStrictEqual([
			'create:0',
			'provider-setup',
			'consumer-setup:local',
			'consumer-dispose',
			'provider-dispose',
			'resource-dispose',
		])
	})

	it('orders pipeline handlers according to dependencies', async () => {
		type Handler = (next: () => string) => () => string
		const token = defineCapability<Handler, () => string>()({
			capabilityId: 'fixture.ordered-pipeline',
			version: '1.0.0',
			cardinality: 'pipeline',
			lifetime: 'application',
			compose: (handlers) =>
				handlers.reduceRight(
					(next, handler) => handler(next),
					() => 'terminal',
				),
		})
		const requirement = requireCapability(token, '^1.0.0')
		const firstProvider = definePlugin({
			pluginId: 'fixture.pipeline-first',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: {
				provides: [
					provideCapability(token, {
						contributionId: 'first',
						create: () => ({
							value: (next) => () => `first(${next()})`,
						}),
					}),
				],
			},
		})
		const secondProvider = definePlugin({
			pluginId: 'fixture.pipeline-second',
			version: '1.0.0',
			core: '^0.0.0',
			dependencies: [{ pluginId: 'fixture.pipeline-first', version: '^1.0.0' }],
			capabilities: {
				provides: [
					provideCapability(token, {
						contributionId: 'second',
						create: () => ({
							value: (next) => () => `second(${next()})`,
						}),
					}),
				],
			},
		})
		let result: string | undefined
		const consumer = definePlugin({
			pluginId: 'fixture.pipeline-consumer',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: { requires: [requirement] },
			setup: ({ capabilities }) => {
				result = capabilities.get(requirement)()
			},
		})
		const application = new FrameworkApplication({
			schemas: [],
			plugins: [consumer, secondProvider, firstProvider],
			pluginPrivileges: { logger: false },
		})

		await application.initialize()

		expect(result).toBe('first(second(terminal))')
	})

	it('materializes and disposes each application resource exactly once', async () => {
		let providerCreates = 0
		let providerDisposes = 0
		const observed: number[] = []
		const token = defineCapability<{ readonly sequence: number }>()({
			capabilityId: 'fixture.resource-application',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'application',
			compose: ([provider]) => provider,
		})
		const requirement = requireCapability(token, '^1.0.0')
		const provider = definePlugin({
			pluginId: 'fixture.resource-winner',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: {
				provides: [
					provideCapability(token, {
						contributionId: 'winner',
						create: () => {
							providerCreates += 1
							const sequence = providerCreates
							return {
								value: { sequence },
								dispose: () => {
									providerDisposes += 1
								},
							}
						},
					}),
				],
			},
		})
		const consumer = definePlugin({
			pluginId: 'fixture.resource-consumer',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: { requires: [requirement] },
			setup: ({ capabilities }) => {
				observed.push(capabilities.get(requirement).sequence)
			},
		})
		const createApplication = () =>
			new FrameworkApplication({
				schemas: [],
				plugins: [consumer, provider],
				pluginPrivileges: { logger: false },
			})
		const first = createApplication()
		const second = createApplication()

		await first.initialize()
		await second.initialize()
		await first.dispose()
		await second.dispose()

		expect(providerCreates).toBe(2)
		expect(providerDisposes).toBe(2)
		expect(observed).toStrictEqual([1, 2])
	})

	it('rejects undeclared reads and same-owner application capability cycles', async () => {
		const undeclaredToken = defineCapability<string>()({
			capabilityId: 'fixture.undeclared-read',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'declaration',
			compose: ([provider]) => provider,
		})
		const undeclaredRequirement = requireCapability(undeclaredToken, '^1.0.0')
		const provider = definePlugin({
			pluginId: 'fixture.undeclared-provider',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: {
				provides: [
					provideCapability(undeclaredToken, {
						contributionId: 'value',
						value: 'value',
					}),
				],
			},
		})
		const undeclaredConsumer = definePlugin({
			pluginId: 'fixture.undeclared-consumer',
			version: '1.0.0',
			core: '^0.0.0',
			setup: ({ capabilities }) => {
				capabilities.get(undeclaredRequirement)
			},
		})
		const undeclaredApplication = new FrameworkApplication({
			schemas: [],
			plugins: [undeclaredConsumer, provider],
			pluginPrivileges: { logger: false },
		})

		await expect(undeclaredApplication.initialize()).rejects.toMatchObject({
			code: 'PLUGIN_CAPABILITY_MISSING',
		})

		const firstToken = defineCapability<string>()({
			capabilityId: 'fixture.cycle-first',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'application',
			compose: ([value]) => value,
		})
		const secondToken = defineCapability<string>()({
			capabilityId: 'fixture.cycle-second',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'application',
			compose: ([value]) => value,
		})
		const firstRequirement = requireCapability(firstToken, '^1.0.0')
		const secondRequirement = requireCapability(secondToken, '^1.0.0')
		const cyclic = definePlugin({
			pluginId: 'fixture.same-owner-cycle',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: {
				provides: [
					provideCapability(firstToken, {
						contributionId: 'first',
						create: ({ capabilities }) => ({
							value: capabilities.get(secondRequirement),
						}),
					}),
					provideCapability(secondToken, {
						contributionId: 'second',
						create: ({ capabilities }) => ({
							value: capabilities.get(firstRequirement),
						}),
					}),
				],
				requires: [firstRequirement, secondRequirement],
			},
		})
		const cyclicApplication = new FrameworkApplication({
			schemas: [],
			plugins: [cyclic],
			pluginPrivileges: { logger: false },
		})

		await expect(cyclicApplication.initialize()).rejects.toMatchObject({
			code: 'PLUGIN_CAPABILITY_CONFLICT',
		})
	})

	it('supports mutual setup-phase capability consumption without lifecycle cycles', async () => {
		const firstToken = defineCapability<string>()({
			capabilityId: 'fixture.peer-first',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'application',
			compose: ([value]) => value,
		})
		const secondToken = defineCapability<string>()({
			capabilityId: 'fixture.peer-second',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'application',
			compose: ([value]) => value,
		})
		const firstReadsSecond = requireCapability(secondToken, '^1.0.0', {
			phase: 'setup',
		})
		const secondReadsFirst = requireCapability(firstToken, '^1.0.0', {
			phase: 'setup',
		})
		const observed: string[] = []
		const first = definePlugin({
			pluginId: 'fixture.peer-first-plugin',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: {
				provides: [
					provideCapability(firstToken, {
						contributionId: 'first',
						create: () => ({ value: 'first' }),
					}),
				],
				requires: [firstReadsSecond],
			},
			setup: ({ capabilities }) => {
				observed.push(`first:${capabilities.get(firstReadsSecond)}`)
			},
		})
		const second = definePlugin({
			pluginId: 'fixture.peer-second-plugin',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: {
				provides: [
					provideCapability(secondToken, {
						contributionId: 'second',
						create: () => ({ value: 'second' }),
					}),
				],
				requires: [secondReadsFirst],
			},
			setup: ({ capabilities }) => {
				observed.push(`second:${capabilities.get(secondReadsFirst)}`)
			},
		})
		const graph = new PluginGraph(normalizePlugins([first, second]))
		const application = new FrameworkApplication({
			schemas: [],
			plugins: [first, second],
			pluginPrivileges: { logger: false },
		})

		await application.initialize()

		expect(observed).toStrictEqual(['first:second', 'second:first'])
		expect(
			graph.capabilities.entries.flatMap((entry) =>
				entry.requirements.map(({ requirement }) => requirement.phase),
			),
		).toStrictEqual(['setup', 'setup'])
		await application.dispose()
	})

	it('keeps mutual materialization requirements as lifecycle cycles', () => {
		const firstToken = defineCapability<string>()({
			capabilityId: 'fixture.materialization-cycle-first',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'application',
			compose: ([value]) => value,
		})
		const secondToken = defineCapability<string>()({
			capabilityId: 'fixture.materialization-cycle-second',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'application',
			compose: ([value]) => value,
		})
		const first = definePlugin({
			pluginId: 'fixture.materialization-cycle-first-plugin',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: {
				provides: [
					provideCapability(firstToken, {
						contributionId: 'first',
						create: () => ({ value: 'first' }),
					}),
				],
				requires: [requireCapability(secondToken, '^1.0.0')],
			},
		})
		const second = definePlugin({
			pluginId: 'fixture.materialization-cycle-second-plugin',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: {
				provides: [
					provideCapability(secondToken, {
						contributionId: 'second',
						create: () => ({ value: 'second' }),
					}),
				],
				requires: [requireCapability(firstToken, '^1.0.0')],
			},
		})

		expect(
			captureFrameworkError(
				() => new PluginGraph(normalizePlugins([first, second])),
			).code,
		).toBe('PLUGIN_DEPENDENCY_CYCLE')
	})

	it('rejects setup-phase reads from application capability factories', async () => {
		const dependencyToken = defineCapability<string>()({
			capabilityId: 'fixture.setup-only-dependency',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'application',
			compose: ([value]) => value,
		})
		const consumerToken = defineCapability<string>()({
			capabilityId: 'fixture.setup-only-consumer',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'application',
			compose: ([value]) => value,
		})
		const setupRequirement = requireCapability(dependencyToken, '^1.0.0', {
			phase: 'setup',
		})
		const dependency = definePlugin({
			pluginId: 'fixture.setup-only-provider',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: {
				provides: [
					provideCapability(dependencyToken, {
						contributionId: 'dependency',
						create: () => ({ value: 'dependency' }),
					}),
				],
			},
		})
		const consumer = definePlugin({
			pluginId: 'fixture.setup-only-factory',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: {
				provides: [
					provideCapability(consumerToken, {
						contributionId: 'consumer',
						create: ({ capabilities }) => ({
							// @ts-expect-error -- Exercises the JavaScript boundary after the typed API rejects this read.
							value: capabilities.get(setupRequirement),
						}),
					}),
				],
				requires: [setupRequirement],
			},
		})
		const application = new FrameworkApplication({
			schemas: [],
			plugins: [dependency, consumer],
			pluginPrivileges: { logger: false },
		})

		await expect(application.initialize()).rejects.toMatchObject({
			code: 'PLUGIN_CAPABILITY_MISSING',
			internalDetails: {
				kind: 'setup-capability-factory-read',
				plugin: 'fixture.setup-only-factory',
				capabilityId: 'fixture.setup-only-dependency',
			},
		})
	})

	it('cleans materialized resources when plugin setup fails', async () => {
		let disposeCalls = 0
		const token = defineCapability<string>()({
			capabilityId: 'fixture.partial-cleanup',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'application',
			compose: ([provider]) => provider,
		})
		const provider = definePlugin({
			pluginId: 'fixture.partial-provider',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: {
				provides: [
					provideCapability(token, {
						contributionId: 'resource',
						create: () => ({
							value: 'ready',
							dispose: () => {
								disposeCalls += 1
							},
						}),
					}),
				],
			},
		})
		const failing = definePlugin({
			pluginId: 'fixture.partial-failure',
			version: '1.0.0',
			core: '^0.0.0',
			setup: () => {
				throw new Error('Setup failure fixture')
			},
		})
		const application = new FrameworkApplication({
			schemas: [],
			plugins: [provider, failing],
			pluginPrivileges: { logger: false },
		})

		await expect(application.initialize()).rejects.toThrow(
			new Error('Setup failure fixture'),
		)
		expect(disposeCalls).toBe(1)
	})

	it('rejects competing single providers statically', () => {
		const token = defineCapability<string>()({
			capabilityId: 'fixture.static-conflicts',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'declaration',
			compose: ([value]) => value,
		})
		const createProvider = (pluginId: string, contributionId: string) =>
			definePlugin({
				pluginId,
				version: '1.0.0',
				core: '^0.0.0',
				capabilities: {
					provides: [
						provideCapability(token, {
							contributionId,
							value: contributionId,
						}),
					],
				},
			})
		const first = createProvider('fixture.conflict-first', 'first')
		const second = createProvider('fixture.conflict-second', 'second')

		expect(
			captureFrameworkError(
				() => new PluginGraph(normalizePlugins([first, second])),
			).internalDetails,
		).toMatchObject({ kind: 'single-capability-provider-conflict' })
	})

	it('denies privileged composition before token code or plugin callbacks run', () => {
		let composeCalls = 0
		let setupCalls = 0
		const token = defineCapability<string>()({
			capabilityId: 'fixture.denied-composition',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'declaration',
			compose: ([provider]) => {
				composeCalls += 1
				return provider
			},
		})
		const provider = definePlugin({
			pluginId: 'fixture.denied-provider',
			version: '1.0.0',
			core: '^0.0.0',
			privileges: [
				{ name: 'event:publish', reason: 'Denied provider fixture.' },
			],
			setup: () => {
				setupCalls += 1
			},
			capabilities: {
				provides: [
					provideCapability(token, {
						contributionId: 'provider',
						value: 'provider',
					}),
				],
			},
		})
		expect(
			() =>
				new FrameworkApplication({
					schemas: [],
					plugins: [provider],
					pluginPrivileges: {
						deny: ['event:publish'],
						logger: false,
					},
				}),
		).toThrow(
			expect.objectContaining<Partial<FrameworkError>>({
				code: 'PLUGIN_PRIVILEGE_DENIED',
			}),
		)
		expect(composeCalls).toBe(0)
		expect(setupCalls).toBe(0)
	})
})
