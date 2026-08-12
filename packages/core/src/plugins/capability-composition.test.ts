import { describe, expect, it } from 'vitest'

import { FrameworkApplication } from '../application/framework-application.js'
import { FrameworkError } from '../errors/framework-error.js'
import {
	decorateCapability,
	defineCapability,
	optionalCapability,
	provideCapability,
	replaceCapability,
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

	it('composes declaration providers, exact replacements, and decorators before setup', async () => {
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
		const replacement = definePlugin({
			pluginId: 'fixture.format-replacement',
			version: '1.0.0',
			core: '^0.0.0',
			privileges: [
				{
					name: 'capability:replace',
					reason: 'Replaces the selected format fixture.',
				},
			],
			capabilities: {
				replaces: [
					replaceCapability(token, {
						contributionId: 'replacement',
						target: {
							owner: {
								pluginId: 'fixture.format-provider',
								instanceId: 'primary',
							},
							contributionId: 'format',
						},
						value: { name: 'replacement' },
					}),
				],
			},
		})
		const decorator = definePlugin({
			pluginId: 'fixture.format-decorator',
			version: '1.0.0',
			core: '^0.0.0',
			privileges: [
				{
					name: 'capability:decorate',
					reason: 'Decorates the complete format fixture.',
				},
			],
			capabilities: {
				decorates: [
					decorateCapability(token, {
						contributionId: 'prefix',
						decorate: (consumer) => ({
							render: () => `decorated:${consumer.render()}`,
						}),
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
			plugins: [consumer, decorator, replacement, provider],
			pluginPrivileges: { logger: false },
		})

		await application.initialize()

		expect(rendered).toBe('decorated:replacement')
		expect(application.pluginPrivilegeReport.allowed).toBe(true)
	})

	it('preserves multiple provider positions across replacement chains', async () => {
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
		const replacement = definePlugin({
			pluginId: 'fixture.multiple-replacement',
			version: '1.0.0',
			core: '^0.0.0',
			privileges: [
				{ name: 'capability:replace', reason: 'Replaces one exact value.' },
			],
			capabilities: {
				replaces: [
					replaceCapability(token, {
						contributionId: 'replacement',
						target: {
							owner: { pluginId: 'fixture.multiple-first' },
							contributionId: 'first',
						},
						value: 'replaced-first',
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
			plugins: [consumer, first, replacement, second],
			pluginPrivileges: { logger: false },
		})

		await application.initialize()
		expect(values).toStrictEqual(['replaced-first', 'second'])
		expect(
			new PluginGraph(
				normalizePlugins([consumer, first, replacement, second]),
			).capabilities.entries.at(-1)?.providerChains,
		).toStrictEqual([
			{
				position: 0,
				contributions: [
					{
						kind: 'provider',
						owner: { pluginId: 'fixture.multiple-first' },
						contributionId: 'first',
					},
					{
						kind: 'replacement',
						owner: { pluginId: 'fixture.multiple-replacement' },
						contributionId: 'replacement',
					},
				],
			},
			{
				position: 1,
				contributions: [
					{
						kind: 'provider',
						owner: { pluginId: 'fixture.multiple-second' },
						contributionId: 'second',
					},
				],
			},
		])
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

	it('orders pipeline handlers and applies the earliest decorator outermost', async () => {
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
		const firstDecorator = definePlugin({
			pluginId: 'fixture.decorator-first',
			version: '1.0.0',
			core: '^0.0.0',
			privileges: [
				{ name: 'capability:decorate', reason: 'Outer wrapper fixture.' },
			],
			capabilities: {
				decorates: [
					decorateCapability(token, {
						contributionId: 'first',
						decorate: (consumer) => () => `A[${consumer()}]`,
					}),
				],
			},
		})
		const secondDecorator = definePlugin({
			pluginId: 'fixture.decorator-second',
			version: '1.0.0',
			core: '^0.0.0',
			dependencies: [
				{ pluginId: 'fixture.decorator-first', version: '^1.0.0' },
			],
			privileges: [
				{ name: 'capability:decorate', reason: 'Inner wrapper fixture.' },
			],
			capabilities: {
				decorates: [
					decorateCapability(token, {
						contributionId: 'second',
						decorate: (consumer) => () => `B[${consumer()}]`,
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
			plugins: [
				consumer,
				secondDecorator,
				firstDecorator,
				secondProvider,
				firstProvider,
			],
			pluginPrivileges: { logger: false },
		})

		await application.initialize()

		expect(result).toBe('A[B[first(second(terminal))]]')
	})

	it('materializes only final replacements and isolates resources per application', async () => {
		let baseCreates = 0
		let replacementCreates = 0
		let replacementDisposes = 0
		const observed: number[] = []
		const token = defineCapability<{ readonly sequence: number }>()({
			capabilityId: 'fixture.replaced-application',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'application',
			compose: ([provider]) => provider,
		})
		const requirement = requireCapability(token, '^1.0.0')
		const provider = definePlugin({
			pluginId: 'fixture.replaced-base',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: {
				provides: [
					provideCapability(token, {
						contributionId: 'base',
						create: () => {
							baseCreates += 1
							return { value: { sequence: -1 } }
						},
					}),
				],
			},
		})
		const replacement = definePlugin({
			pluginId: 'fixture.replaced-winner',
			version: '1.0.0',
			core: '^0.0.0',
			privileges: [
				{
					name: 'capability:replace',
					reason: 'Replaces the application provider fixture.',
				},
			],
			capabilities: {
				replaces: [
					replaceCapability(token, {
						contributionId: 'winner',
						target: {
							owner: { pluginId: 'fixture.replaced-base' },
							contributionId: 'base',
						},
						create: () => {
							replacementCreates += 1
							const sequence = replacementCreates
							return {
								value: { sequence },
								dispose: () => {
									replacementDisposes += 1
								},
							}
						},
					}),
				],
			},
		})
		const consumer = definePlugin({
			pluginId: 'fixture.replaced-consumer',
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
				plugins: [consumer, replacement, provider],
				pluginPrivileges: { logger: false },
			})
		const first = createApplication()
		const second = createApplication()

		await first.initialize()
		await second.initialize()
		await first.dispose()
		await second.dispose()

		expect(baseCreates).toBe(0)
		expect(replacementCreates).toBe(2)
		expect(replacementDisposes).toBe(2)
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

	it('rejects missing, incompatible, and cyclic replacement targets', () => {
		const token = defineCapability<string>()({
			capabilityId: 'fixture.replacement-targets',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'declaration',
			compose: ([provider]) => provider,
		})
		const replacementPlugin = (
			pluginId: string,
			contributionId: string,
			targetPluginId: string,
			targetContributionId: string,
		) =>
			definePlugin({
				pluginId,
				version: '1.0.0',
				core: '^0.0.0',
				privileges: [
					{ name: 'capability:replace', reason: 'Target validation fixture.' },
				],
				capabilities: {
					replaces: [
						replaceCapability(token, {
							contributionId,
							target: {
								owner: { pluginId: targetPluginId },
								contributionId: targetContributionId,
							},
							value: contributionId,
						}),
					],
				},
			})
		const missing = replacementPlugin(
			'fixture.missing-replacement',
			'missing',
			'fixture.absent-provider',
			'absent',
		)

		expect(
			captureFrameworkError(() => new PluginGraph(normalizePlugins([missing])))
				.internalDetails,
		).toMatchObject({ kind: 'capability-replacement-target-missing' })

		const firstCycle = replacementPlugin(
			'fixture.cycle-replacement-first',
			'first',
			'fixture.cycle-replacement-second',
			'second',
		)
		const secondCycle = replacementPlugin(
			'fixture.cycle-replacement-second',
			'second',
			'fixture.cycle-replacement-first',
			'first',
		)
		expect(
			captureFrameworkError(
				() => new PluginGraph(normalizePlugins([firstCycle, secondCycle])),
			).internalDetails,
		).toMatchObject({ kind: 'capability-replacement-cycle' })

		const previousToken = defineCapability<string>()({
			capabilityId: 'fixture.versioned-replacement',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'declaration',
			compose: ([provider]) => provider,
		})
		const nextToken = defineCapability<string>()({
			capabilityId: 'fixture.versioned-replacement',
			version: '2.0.0',
			cardinality: 'single',
			lifetime: 'declaration',
			compose: ([provider]) => provider,
		})
		const previous = definePlugin({
			pluginId: 'fixture.versioned-provider',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: {
				provides: [
					provideCapability(previousToken, {
						contributionId: 'provider',
						value: 'previous',
					}),
				],
			},
		})
		const incompatible = definePlugin({
			pluginId: 'fixture.versioned-replacer',
			version: '1.0.0',
			core: '^0.0.0',
			privileges: [
				{ name: 'capability:replace', reason: 'Version mismatch fixture.' },
			],
			capabilities: {
				replaces: [
					replaceCapability(nextToken, {
						contributionId: 'replacement',
						target: {
							owner: { pluginId: 'fixture.versioned-provider' },
							contributionId: 'provider',
						},
						value: 'next',
					}),
				],
			},
		})
		const error = captureFrameworkError(
			() => new PluginGraph(normalizePlugins([previous, incompatible])),
		)
		expect(error.code).toBe('PLUGIN_PROTOCOL_INCOMPATIBLE')
		expect(error.internalDetails).toMatchObject({
			kind: 'capability-replacement-version',
			replacementVersion: '2.0.0',
			targetVersion: '1.0.0',
		})
	})

	it('rejects competing singles, missing privileges, and replacement branches statically', () => {
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

		const unauthorized = definePlugin({
			pluginId: 'fixture.unauthorized-replacement',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: {
				replaces: [
					replaceCapability(token, {
						contributionId: 'unauthorized',
						target: {
							owner: { pluginId: 'fixture.conflict-first' },
							contributionId: 'first',
						},
						value: 'unauthorized',
					}),
				],
			},
		})

		expect(
			captureFrameworkError(
				() => new PluginGraph(normalizePlugins([first, unauthorized])),
			).internalDetails,
		).toMatchObject({ kind: 'capability-privilege-missing' })

		const branch = (pluginId: string, contributionId: string) =>
			definePlugin({
				pluginId,
				version: '1.0.0',
				core: '^0.0.0',
				privileges: [
					{ name: 'capability:replace', reason: 'Branch conflict fixture.' },
				],
				capabilities: {
					replaces: [
						replaceCapability(token, {
							contributionId,
							target: {
								owner: { pluginId: 'fixture.conflict-first' },
								contributionId: 'first',
							},
							value: contributionId,
						}),
					],
				},
			})

		expect(
			captureFrameworkError(
				() =>
					new PluginGraph(
						normalizePlugins([
							first,
							branch('fixture.branch-one', 'one'),
							branch('fixture.branch-two', 'two'),
						]),
					),
			).internalDetails,
		).toMatchObject({ kind: 'capability-replacement-branch' })
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
			capabilities: {
				provides: [
					provideCapability(token, {
						contributionId: 'provider',
						value: 'provider',
					}),
				],
			},
		})
		const replacement = definePlugin({
			pluginId: 'fixture.denied-replacement',
			version: '1.0.0',
			core: '^0.0.0',
			privileges: [
				{
					name: 'capability:replace',
					reason: 'Denied composition fixture.',
				},
			],
			capabilities: {
				replaces: [
					replaceCapability(token, {
						contributionId: 'replacement',
						target: {
							owner: { pluginId: 'fixture.denied-provider' },
							contributionId: 'provider',
						},
						value: 'replacement',
					}),
				],
			},
			setup: () => {
				setupCalls += 1
			},
		})

		expect(
			() =>
				new FrameworkApplication({
					schemas: [],
					plugins: [provider, replacement],
					pluginPrivileges: {
						deny: ['capability:replace'],
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
