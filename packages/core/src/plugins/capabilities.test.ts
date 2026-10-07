import { describe, expect, it } from 'vitest'

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

interface AuditEndpoint {
	readonly endpoint: string
}

const declarationToken = defineCapability<
	AuditEndpoint,
	readonly AuditEndpoint[]
>()({
	capabilityId: 'fixture.audit-sink',
	version: '1.2.0',
	cardinality: 'multiple',
	lifetime: 'declaration',
	compose: (providers) => providers,
})

interface MessageSink {
	readonly write: (message: string) => Promise<void>
}

const applicationToken = defineCapability<
	MessageSink,
	readonly MessageSink[]
>()({
	capabilityId: 'fixture.message-sink',
	version: '2.0.0',
	cardinality: 'pipeline',
	lifetime: 'application',
	compose: (providers) => providers,
})

describe('capability declarations', () => {
	it('classifies one flat authoring list into stable inspection buckets', () => {
		const provider = provideCapability(declarationToken, {
			value: { endpoint: 'https://audit.example' },
		})
		const required = requireCapability(declarationToken, '^1.0.0')
		const optional = optionalCapability(declarationToken, '^1.0.0')
		const declarations = [optional, provider, required]
		const plugin = createPlugin({
			id: 'fixture.flat-capabilities',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: declarations,
		})

		declarations.length = 0

		expect(plugin.manifest.capabilities).toStrictEqual({
			provides: [provider],
			requires: [required],
			optional: [optional],
		})
		expect(Object.isFrozen(plugin.manifest.capabilities.provides)).toBe(true)
		expect(provider.contributionId).toBe('fixture.audit-sink')
	})

	it('rejects the removed grouped authoring shape at the JavaScript boundary', () => {
		const provider = provideCapability(declarationToken, {
			value: { endpoint: 'https://audit.example' },
		})

		expect(() =>
			createPlugin({
				contributions: { provides: [provider] } as never,
				core: '^0.0.0',
				id: 'fixture.grouped-capabilities',
				version: '1.0.0',
			}),
		).toThrow('plugin contributions must be an array')
	})

	it('creates frozen serializable metadata for every cardinality and lifetime', () => {
		const singleToken = defineCapability<string>()({
			capabilityId: 'fixture.primary-store',
			version: '1.0.0',
			cardinality: 'single',
			lifetime: 'application',
			compose: ([provider]) => provider,
		})

		expect(declarationToken).toStrictEqual({
			kind: 'capability-token',
			capabilityId: 'fixture.audit-sink',
			version: '1.2.0',
			cardinality: 'multiple',
			lifetime: 'declaration',
		})
		expect(applicationToken.cardinality).toBe('pipeline')
		expect(singleToken.cardinality).toBe('single')
		expect(Object.isFrozen(declarationToken)).toBe(true)
		expect(JSON.parse(JSON.stringify(declarationToken))).toStrictEqual(
			declarationToken,
		)

		const materializationRequirement = requireCapability(
			applicationToken,
			'^2.0.0',
		)
		const setupRequirement = optionalCapability(applicationToken, '^2.0.0', {
			phase: 'setup',
		})

		expect(materializationRequirement.phase).toBe('materialization')
		expect(setupRequirement.phase).toBe('setup')
		expect(Object.isFrozen(setupRequirement)).toBe(true)
	})

	it('snapshots declaration values and keeps application providers inert', () => {
		const source = { endpoint: 'https://audit.example' }
		const declarationProvider = provideCapability(declarationToken, {
			contributionId: 'primary',
			value: source,
		})
		const applicationProvider = provideCapability(applicationToken, {
			contributionId: 'primary',
			create: () => ({
				value: { write: () => Promise.resolve() },
			}),
		})

		source.endpoint = 'https://changed.example'

		expect(declarationProvider).toStrictEqual({
			kind: 'capability-provider',
			token: declarationToken,
			contributionId: 'primary',
			value: { endpoint: 'https://audit.example' },
		})
		expect(Object.isFrozen(declarationProvider.value)).toBe(true)
		expect(applicationProvider).toStrictEqual({
			kind: 'capability-provider',
			token: applicationToken,
			contributionId: 'primary',
		})
		expect('value' in applicationProvider).toBe(false)
	})

	it('validates protocol metadata, ranges, serializable values, and provenance', () => {
		expect(() =>
			defineCapability()({
				capabilityId: 'audit',
				version: '1.0.0',
				cardinality: 'single',
				lifetime: 'declaration',
				compose: ([provider]) => provider,
			}),
		).toThrow(
			new TypeError('capabilityId must be a namespaced capability identifier'),
		)
		expect(() =>
			defineCapability()({
				capabilityId: 'fixture.audit',
				version: 'v1.0.0',
				cardinality: 'single',
				lifetime: 'declaration',
				compose: ([provider]) => provider,
			}),
		).toThrow(
			new TypeError('capability version must be a canonical semantic version'),
		)
		expect(() => requireCapability(declarationToken, '^2.0.0')).toThrow(
			new TypeError(
				'Capability token fixture.audit-sink@1.2.0 does not satisfy its declared range ^2.0.0',
			),
		)
		expect(() =>
			optionalCapability(applicationToken, '^2.0.0', {
				phase: 'invalid',
			} as never),
		).toThrow(
			new TypeError(
				'capability requirement phase must be materialization or setup',
			),
		)
		expect(() =>
			requireCapability(applicationToken, '^2.0.0', {
				phase: 'setup',
				unexpected: true,
			} as never),
		).toThrow(
			new TypeError(
				'capability requirement options contains unknown option: unexpected',
			),
		)
		expect(() =>
			provideCapability(declarationToken, {
				contributionId: 'invalid',
				value: {
					// Runtime validation protects JavaScript callers from non-JSON values.
					endpoint: new Date(),
				} as unknown as { readonly endpoint: string },
			}),
		).toThrow(
			new TypeError(
				'capability provider value.endpoint must contain only plain JSON objects',
			),
		)
		expect(() =>
			provideCapability(
				{
					...declarationToken,
				},
				{
					contributionId: 'forged',
					value: { endpoint: 'https://audit.example' },
				},
			),
		).toThrow(
			new TypeError(
				'capability provider token must be created by defineCapability',
			),
		)
	})
})

describe('CapabilityInventory', () => {
	it('requires explicit IDs only for repeated providers from one owner', () => {
		const createDeclaration = (endpoint: string, contributionId?: string) =>
			provideCapability(declarationToken, {
				...(contributionId === undefined ? {} : { contributionId }),
				value: { endpoint },
			})
		const createProvider = (
			first: ReturnType<typeof createDeclaration>,
			second: ReturnType<typeof createDeclaration>,
		) =>
			createPlugin({
				id: 'fixture.repeated-audit',
				version: '1.0.0',
				core: '^0.0.0',
				contributions: [first, second],
			})

		expect(
			() =>
				new PluginGraph(
					normalizePlugins([
						createProvider(
							createDeclaration('first'),
							createDeclaration('second'),
						),
					]),
				),
		).toThrow(expect.objectContaining({ code: 'PLUGIN_CAPABILITY_CONFLICT' }))

		const graph = new PluginGraph(
			normalizePlugins([
				createProvider(
					createDeclaration('first', 'first'),
					createDeclaration('second', 'second'),
				),
			]),
		)
		expect(graph.capabilities.entries[0]?.providers).toHaveLength(2)
	})

	it('scopes duplicate contribution IDs to the exact plugin instance', () => {
		const declaration = provideCapability(declarationToken, {
			contributionId: 'shared-local-id',
			value: { endpoint: 'https://audit.example' },
		})
		const provider = (instanceId: string, duplicate = false) =>
			createPlugin({
				id: 'fixture.instanced-audit',
				instanceId,
				version: '1.0.0',
				core: '^0.0.0',
				contributions: duplicate ? [declaration, declaration] : [declaration],
			})
		// A local contribution ID is reusable by another explicit instance, never twice by its owner.
		const graph = new PluginGraph(
			normalizePlugins([provider('first'), provider('second')]),
		)
		expect(
			graph.capabilities.entries[0]?.providers.map(
				({ owner }) => owner.instanceId,
			),
		).toStrictEqual(['first', 'second'])
		expect(
			() => new PluginGraph(normalizePlugins([provider('first', true)])),
		).toThrow(
			expect.objectContaining({
				code: 'PLUGIN_CAPABILITY_CONFLICT',
			}),
		)
	})

	it('validates providers, optional requirements, and conditional privileges statically', () => {
		const optionalAudit = optionalCapability(declarationToken, '^1.0.0')
		const provider = createPlugin({
			id: 'fixture.audit-provider',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				provideCapability(declarationToken, {
					contributionId: 'primary',
					value: { endpoint: 'https://audit.example' },
				}),
			],
		})
		const consumer = createPlugin({
			id: 'fixture.audit-consumer',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: {
				'event:publish': {
					reason: 'Forwards records when the audit sink is installed.',
					when: optionalAudit,
				},
			},
			contributions: [withPluginPrivileges(optionalAudit, ['event:publish'])],
		})

		const present = new PluginGraph(normalizePlugins([consumer, provider]))
		const absent = new PluginGraph(normalizePlugins([consumer]))
		const [privilege] = consumer.manifest.privileges
		if (privilege === undefined) throw new TypeError('Missing test privilege')

		expect(present.capabilities.entries).toHaveLength(1)
		expect(
			present.capabilities.entries.find(
				({ token: candidate }) => candidate === declarationToken,
			)?.providers,
		).toStrictEqual([
			{
				kind: 'provider',
				owner: { pluginId: 'fixture.audit-provider' },
				contributionId: 'primary',
			},
		])
		expect(
			present.capabilities.isPrivilegeActive(
				consumer.manifest.identity,
				privilege,
			),
		).toBe(true)
		expect(
			absent.capabilities.isPrivilegeActive(
				consumer.manifest.identity,
				privilege,
			),
		).toBe(false)
		expect(Object.isFrozen(present.capabilities.entries)).toBe(true)
	})

	it('rejects missing required capabilities before plugin callbacks run', () => {
		let setupCalls = 0
		const consumer = createPlugin({
			id: 'fixture.required-consumer',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				requireCapability(applicationToken, '^2.0.0'),
				contributeApplication((context) => {
					setupCalls += 1
					const exports = undefined
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return { exports }
				}),
			],
		})

		expect(() => new PluginGraph(normalizePlugins([consumer]))).toThrow(
			expect.objectContaining<Partial<FrameworkError>>({
				code: 'PLUGIN_CAPABILITY_MISSING',
			}),
		)
		expect(setupCalls).toBe(0)
	})

	it('rejects separately created tokens with the same protocol identity and names both owners', () => {
		const duplicateToken = defineCapability<{ readonly endpoint: string }>()({
			capabilityId: 'fixture.audit-sink',
			version: '1.2.0',
			cardinality: 'multiple',
			lifetime: 'declaration',
			compose: (providers) => providers[0] ?? { endpoint: 'absent' },
		})
		const first = createPlugin({
			id: 'fixture.first-provider',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				provideCapability(declarationToken, {
					contributionId: 'first',
					value: { endpoint: 'first' },
				}),
			],
		})
		const second = createPlugin({
			id: 'fixture.second-provider',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				provideCapability(duplicateToken, {
					contributionId: 'second',
					value: { endpoint: 'second' },
				}),
			],
		})

		expect(() => new PluginGraph(normalizePlugins([first, second]))).toThrow(
			new FrameworkError(
				'PLUGIN_CAPABILITY_CONFLICT',
				'Capability "fixture.audit-sink@1.2.0" uses distinct nominal tokens in plugins "fixture.first-provider" and "fixture.second-provider".',
				{
					internalDetails: {
						kind: 'duplicate-capability-token',
						capabilityId: 'fixture.audit-sink',
						version: '1.2.0',
						firstOwner: 'fixture.first-provider',
						secondOwner: 'fixture.second-provider',
					},
				},
			),
		)
	})

	it('requires privilege conditions to reference the manifest optional declaration', () => {
		const declared = optionalCapability(declarationToken, '^1.0.0')
		const other = optionalCapability(declarationToken, '^1.0.0')

		expect(() =>
			createPlugin({
				id: 'fixture.invalid-condition',
				version: '1.0.0',
				core: '^0.0.0',
				permissions: {
					'event:publish': {
						reason: 'Invalid detached condition.',
						when: other,
					},
				},
				contributions: [withPluginPrivileges(declared, ['event:publish'])],
			}),
		).toThrow(
			new TypeError(
				'plugin permissions.event:publish.when must reference an optional capability contribution declared by the plugin',
			),
		)
	})
})
