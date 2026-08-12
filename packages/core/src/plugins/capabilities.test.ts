import { describe, expect, it } from 'vitest'

import { FrameworkError } from '../errors/framework-error.js'
import {
	defineCapability,
	optionalCapability,
	provideCapability,
	replaceCapability,
	requireCapability,
} from './capabilities.js'
import { definePlugin } from './definition.js'
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
		const replacementSource = { endpoint: 'https://replacement.example' }
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
		const replacement = replaceCapability(declarationToken, {
			contributionId: 'replacement',
			target: {
				owner: { pluginId: 'fixture.audit-provider' },
				contributionId: 'primary',
			},
			value: replacementSource,
		})

		source.endpoint = 'https://changed.example'
		replacementSource.endpoint = 'https://changed.example'

		expect(declarationProvider).toStrictEqual({
			kind: 'capability-provider',
			token: declarationToken,
			contributionId: 'primary',
			value: { endpoint: 'https://audit.example' },
		})
		expect(Object.isFrozen(declarationProvider.value)).toBe(true)
		expect(replacement.value).toStrictEqual({
			endpoint: 'https://replacement.example',
		})
		expect(Object.isFrozen(replacement.value)).toBe(true)
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
			replaceCapability(declarationToken, {
				contributionId: 'invalid',
				target: {
					owner: { pluginId: 'fixture.audit-provider' },
					contributionId: 'primary',
				},
				value: {
					// Runtime validation protects JavaScript callers from non-JSON values.
					endpoint: new Date(),
				} as unknown as { readonly endpoint: string },
			}),
		).toThrow(
			new TypeError(
				'capability replacement value.endpoint must contain only plain JSON objects',
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
	it('validates providers, optional requirements, and conditional privileges statically', () => {
		const optionalAudit = optionalCapability(declarationToken, '^1.0.0')
		const provider = definePlugin({
			pluginId: 'fixture.audit-provider',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: {
				provides: [
					provideCapability(declarationToken, {
						contributionId: 'primary',
						value: { endpoint: 'https://audit.example' },
					}),
				],
			},
		})
		const consumer = definePlugin({
			pluginId: 'fixture.audit-consumer',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: { optional: [optionalAudit] },
			privileges: [
				{
					name: 'network:access',
					reason: 'Forwards records when the audit sink is installed.',
					when: optionalAudit,
				},
			],
		})

		const present = new PluginGraph(normalizePlugins([consumer, provider]))
		const absent = new PluginGraph(normalizePlugins([consumer]))
		const [privilege] = consumer.manifest.privileges

		expect(present.capabilities.entries).toHaveLength(1)
		expect(present.capabilities.entries[0]?.providers).toStrictEqual([
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
		const consumer = definePlugin({
			pluginId: 'fixture.required-consumer',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: {
				requires: [requireCapability(applicationToken, '^2.0.0')],
			},
			setup: () => {
				setupCalls += 1
			},
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
		const first = definePlugin({
			pluginId: 'fixture.first-provider',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: {
				provides: [
					provideCapability(declarationToken, {
						contributionId: 'first',
						value: { endpoint: 'first' },
					}),
				],
			},
		})
		const second = definePlugin({
			pluginId: 'fixture.second-provider',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: {
				provides: [
					provideCapability(duplicateToken, {
						contributionId: 'second',
						value: { endpoint: 'second' },
					}),
				],
			},
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
			definePlugin({
				pluginId: 'fixture.invalid-condition',
				version: '1.0.0',
				core: '^0.0.0',
				capabilities: { optional: [declared] },
				privileges: [
					{
						name: 'network:access',
						reason: 'Invalid detached condition.',
						when: other,
					},
				],
			}),
		).toThrow(
			new TypeError(
				'privileges[0].when must reference a requirement from capabilities.optional',
			),
		)
	})
})
