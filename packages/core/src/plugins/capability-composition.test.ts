import { describe, expect, it } from 'vitest'
import { applicationFixture } from '../../tests/application-fixture.js'

import { FrameworkApplication } from '../application/framework-application.js'
import { FrameworkError } from '../errors/framework-error.js'
import {
	defineCapability,
	optionalCapability,
	provideCapability,
	requireCapability,
} from './capabilities.js'
import { plugin as createPlugin } from './plugin.js'
import {
	contributeApplication,
	withPluginPrivileges,
} from './plugin-contributions.js'

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
		const consumer = createPlugin({
			id: 'fixture.optional-declaration-consumer',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				requirement,
				contributeApplication(({ capabilities }) => {
					resolved = capabilities.get(requirement)
					const exports = undefined
					return { exports }
				}),
			],
		})
		const application = applicationFixture(
			new FrameworkApplication({
				schemas: [],
				plugins: [consumer],
				logger: false,
			}),
		)

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
		const provider = createPlugin({
			id: 'fixture.format-provider',
			instanceId: 'primary',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				provideCapability(token, {
					contributionId: 'format',
					value: { name: 'original' },
				}),
			],
		})
		let rendered: string | undefined
		const consumer = createPlugin({
			id: 'fixture.format-consumer',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				requirement,
				contributeApplication(({ capabilities }) => {
					rendered = capabilities.get(requirement).render()
					const exports = undefined
					return { exports }
				}),
			],
		})
		const application = applicationFixture(
			new FrameworkApplication({
				schemas: [],
				plugins: [consumer, provider],
				logger: false,
			}),
		)

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
		const first = createPlugin({
			id: 'fixture.multiple-first',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				provideCapability(token, {
					contributionId: 'first',
					value: 'first',
				}),
			],
		})
		const second = createPlugin({
			id: 'fixture.multiple-second',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				provideCapability(token, {
					contributionId: 'second',
					value: 'second',
				}),
			],
		})
		let values: readonly string[] = []
		const consumer = createPlugin({
			id: 'fixture.multiple-consumer',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				requirement,
				contributeApplication(({ capabilities }) => {
					values = capabilities.get(requirement)
					const exports = undefined
					return { exports }
				}),
			],
		})
		const application = applicationFixture(
			new FrameworkApplication({
				schemas: [],
				plugins: [consumer, first, second],
				logger: false,
			}),
		)

		await application.initialize()
		expect(values).toStrictEqual(['first', 'second'])
		await application.dispose()
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
		const firstProvider = createPlugin({
			id: 'fixture.pipeline-first',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				provideCapability(token, {
					contributionId: 'first',
					create: () => ({
						value: (next) => () => `first(${next()})`,
					}),
				}),
			],
		})
		const secondProvider = createPlugin({
			id: 'fixture.pipeline-second',
			version: '1.0.0',
			core: '^0.0.0',
			dependencies: [{ pluginId: 'fixture.pipeline-first', version: '^1.0.0' }],
			contributions: [
				provideCapability(token, {
					contributionId: 'second',
					create: () => ({
						value: (next) => () => `second(${next()})`,
					}),
				}),
			],
		})
		let result: string | undefined
		const consumer = createPlugin({
			id: 'fixture.pipeline-consumer',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				requirement,
				contributeApplication(({ capabilities }) => {
					result = capabilities.get(requirement)()
					const exports = undefined
					return { exports }
				}),
			],
		})
		const application = applicationFixture(
			new FrameworkApplication({
				schemas: [],
				plugins: [consumer, secondProvider, firstProvider],
				logger: false,
			}),
		)

		await application.initialize()

		expect(result).toBe('first(second(terminal))')
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
		const provider = createPlugin({
			id: 'fixture.undeclared-provider',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				provideCapability(undeclaredToken, {
					contributionId: 'value',
					value: 'value',
				}),
			],
		})
		const undeclaredConsumer = createPlugin({
			id: 'fixture.undeclared-consumer',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				contributeApplication(({ capabilities }) => {
					capabilities.get(undeclaredRequirement)
					const exports = undefined
					return { exports }
				}),
			],
		})
		const undeclaredApplication = applicationFixture(
			new FrameworkApplication({
				schemas: [],
				plugins: [undeclaredConsumer, provider],
				logger: false,
			}),
		)

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
		const cyclic = createPlugin({
			id: 'fixture.same-owner-cycle',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
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
				firstRequirement,
				secondRequirement,
			],
		})
		const cyclicApplication = applicationFixture(
			new FrameworkApplication({
				schemas: [],
				plugins: [cyclic],
				logger: false,
			}),
		)

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
		const first = createPlugin({
			id: 'fixture.peer-first-plugin',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				provideCapability(firstToken, {
					contributionId: 'first',
					create: () => ({ value: 'first' }),
				}),
				firstReadsSecond,
				contributeApplication(({ capabilities }) => {
					observed.push(`first:${capabilities.get(firstReadsSecond)}`)
					const exports = undefined
					return { exports }
				}),
			],
		})
		const second = createPlugin({
			id: 'fixture.peer-second-plugin',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				provideCapability(secondToken, {
					contributionId: 'second',
					create: () => ({ value: 'second' }),
				}),
				secondReadsFirst,
				contributeApplication(({ capabilities }) => {
					observed.push(`second:${capabilities.get(secondReadsFirst)}`)
					const exports = undefined
					return { exports }
				}),
			],
		})
		const graph = new PluginGraph(normalizePlugins([first, second]))
		const application = applicationFixture(
			new FrameworkApplication({
				schemas: [],
				plugins: [first, second],
				logger: false,
			}),
		)

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
		const first = createPlugin({
			id: 'fixture.materialization-cycle-first-plugin',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				provideCapability(firstToken, {
					contributionId: 'first',
					create: () => ({ value: 'first' }),
				}),
				requireCapability(secondToken, '^1.0.0'),
			],
		})
		const second = createPlugin({
			id: 'fixture.materialization-cycle-second-plugin',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				provideCapability(secondToken, {
					contributionId: 'second',
					create: () => ({ value: 'second' }),
				}),
				requireCapability(firstToken, '^1.0.0'),
			],
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
		const dependency = createPlugin({
			id: 'fixture.setup-only-provider',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				provideCapability(dependencyToken, {
					contributionId: 'dependency',
					create: () => ({ value: 'dependency' }),
				}),
			],
		})
		const consumer = createPlugin({
			id: 'fixture.setup-only-factory',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				provideCapability(consumerToken, {
					contributionId: 'consumer',
					create: ({ capabilities }) => ({
						// @ts-expect-error -- Exercises the JavaScript boundary after the typed API rejects this read.
						value: capabilities.get(setupRequirement),
					}),
				}),
				setupRequirement,
			],
		})
		const application = applicationFixture(
			new FrameworkApplication({
				schemas: [],
				plugins: [dependency, consumer],
				logger: false,
			}),
		)

		await expect(application.initialize()).rejects.toMatchObject({
			code: 'PLUGIN_CAPABILITY_MISSING',
			internalDetails: {
				kind: 'setup-capability-factory-read',
				plugin: 'fixture.setup-only-factory',
				capabilityId: 'fixture.setup-only-dependency',
			},
		})
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
			createPlugin({
				id: pluginId,
				version: '1.0.0',
				core: '^0.0.0',
				contributions: [
					provideCapability(token, {
						contributionId,
						value: contributionId,
					}),
				],
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
		const provider = createPlugin({
			id: 'fixture.denied-provider',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: { 'event:publish': 'Denied provider fixture.' },
			contributions: [
				provideCapability(token, {
					contributionId: 'provider',
					value: 'provider',
				}),
				withPluginPrivileges(
					contributeApplication((context) => {
						setupCalls += 1
						const exports = undefined
						const lifecycleContext = { ...context, pluginExports: exports }
						void lifecycleContext
						return { exports }
					}),
					['event:publish'],
				),
			],
		})
		expect(() =>
			applicationFixture(
				new FrameworkApplication({
					schemas: [],
					plugins: [provider],
					pluginPrivileges: {
						deny: ['event:publish'],
					},
					logger: false,
				}),
			),
		).toThrow(
			expect.objectContaining<Partial<FrameworkError>>({
				code: 'PLUGIN_PRIVILEGE_DENIED',
			}),
		)
		expect(composeCalls).toBe(0)
		expect(setupCalls).toBe(0)
	})
})
