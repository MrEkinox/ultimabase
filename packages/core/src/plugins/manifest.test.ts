import { describe, expect, it } from 'vitest'

import {
	definePlugin,
	pluginEnvironmentClaimMetadata,
	pluginPrivilegeMetadata,
} from '../index.js'

describe('plugin manifests', () => {
	it('publishes the complete privilege vocabulary with facade ownership and severity', () => {
		expect(Object.keys(pluginPrivilegeMetadata)).toStrictEqual([
			'schema:declare',
			'schema:transform',
			'schema:replace',
			'model:extend',
			'query:extend',
			'operation:declare',
			'capability:decorate',
			'capability:replace',
			'runtime:observe',
			'runtime:intercept',
			'runtime:constrain',
			'runtime:replace',
			'persistence:rewrite',
			'adapter:consume',
			'adapter:raw',
			'migration:contribute',
			'transport:expose',
			'event:publish',
			'typegen:reference',
			'typegen:contribute',
			'typegen:emit',
			'authority:elevate',
		])
		expect(
			Object.entries(pluginPrivilegeMetadata)
				.filter(([, metadata]) => metadata.severity === 'critical')
				.map(([name]) => name),
		).toStrictEqual([
			'schema:replace',
			'runtime:replace',
			'adapter:raw',
			'authority:elevate',
		])
		for (const metadata of Object.values(pluginPrivilegeMetadata)) {
			expect(metadata.facade).toBeTruthy()
			expect(['standard', 'sensitive', 'critical']).toContain(metadata.severity)
			expect(Object.isFrozen(metadata)).toBe(true)
		}
		expect(Object.isFrozen(pluginPrivilegeMetadata)).toBe(true)
	})

	it('publishes review metadata for every informational environment claim', () => {
		expect(pluginEnvironmentClaimMetadata).toStrictEqual({
			'environment:filesystem': {
				reason: 'Declares direct host filesystem behavior.',
				severity: 'sensitive',
			},
			'environment:native-code': {
				reason: 'Declares direct native-code behavior.',
				severity: 'critical',
			},
			'environment:network': {
				reason: 'Declares direct host network behavior.',
				severity: 'sensitive',
			},
			'environment:process': {
				reason: 'Declares direct host process behavior.',
				severity: 'sensitive',
			},
		})
		for (const metadata of Object.values(pluginEnvironmentClaimMetadata)) {
			expect(Object.isFrozen(metadata)).toBe(true)
		}
		expect(Object.isFrozen(pluginEnvironmentClaimMetadata)).toBe(true)
	})

	it('keeps nested manifests and privilege requests owner-scoped', () => {
		const child = definePlugin({
			pluginId: 'fixture.child',
			version: '2.0.0',
			core: '^0.0.0',
			privileges: [
				{ name: 'runtime:observe', reason: 'Records child activity.' },
			] as const,
		})
		const parent = definePlugin({
			pluginId: 'fixture.parent',
			version: '1.0.0',
			core: '^0.0.0',
			privileges: [
				{ name: 'schema:declare', reason: 'Declares parent schemas.' },
			] as const,
			plugins: [child],
		})

		expect(parent.manifest.privileges).toStrictEqual([
			{ name: 'schema:declare', reason: 'Declares parent schemas.' },
		])
		expect(parent.plugins?.[0]?.manifest).toBe(child.manifest)
		expect(child.manifest.privileges).toStrictEqual([
			{ name: 'runtime:observe', reason: 'Records child activity.' },
		])
	})

	it.each([
		[
			{ pluginId: 'unnamespaced', version: '1.0.0', core: '^0.0.0' },
			'pluginId must be a namespaced plugin identifier',
		],
		[
			{
				pluginId: 'fixture.plugin',
				instanceId: '',
				version: '1.0.0',
				core: '^0.0.0',
			},
			'instanceId must be a non-empty string',
		],
		[
			{ pluginId: 'fixture.plugin', version: 'v1.0.0', core: '^0.0.0' },
			'version must be a canonical semantic version',
		],
		[
			{ pluginId: 'fixture.plugin', version: '1.0.0', core: 'later' },
			'core must be a valid semantic version range',
		],
	] as const)(
		'rejects malformed identity and SemVer metadata',
		(options, message) => {
			expect(() => definePlugin(options)).toThrow(new TypeError(message))
		},
	)

	it('rejects malformed, duplicate, wildcard, and unexplained privilege requests', () => {
		const base = {
			pluginId: 'fixture.plugin',
			version: '1.0.0',
			core: '^0.0.0',
		} as const

		expect(() =>
			definePlugin({
				...base,
				// @ts-expect-error -- Runtime validation protects JavaScript callers.
				privileges: 'runtime:observe',
			}),
		).toThrow(new TypeError('privileges must be an array'))
		expect(() =>
			definePlugin({
				...base,
				privileges: [
					// @ts-expect-error -- Wildcards are not concrete privileges.
					{ name: 'runtime:*', reason: 'Too broad.' },
				],
			}),
		).toThrow(
			new TypeError('privileges[0].name must be a concrete PluginPrivilege'),
		)
		expect(() =>
			definePlugin({
				...base,
				privileges: [{ name: 'runtime:observe', reason: '' }],
			}),
		).toThrow(new TypeError('privileges[0].reason must be a non-empty string'))
		expect(() =>
			definePlugin({
				...base,
				privileges: [
					{ name: 'runtime:observe', reason: 'First request.' },
					{ name: 'runtime:observe', reason: 'Duplicate request.' },
				],
			}),
		).toThrow(
			new TypeError('Duplicate plugin privilege request: runtime:observe'),
		)
	})

	it('rejects unknown and duplicate environmental claims independently', () => {
		const base = {
			pluginId: 'fixture.plugin',
			version: '1.0.0',
			core: '^0.0.0',
		} as const

		expect(() =>
			definePlugin({
				...base,
				// @ts-expect-error -- Runtime validation protects JavaScript callers.
				environment: ['environment:camera'],
			}),
		).toThrow(
			new TypeError('environment[0] must be a concrete PluginEnvironmentClaim'),
		)
		expect(() =>
			definePlugin({
				...base,
				environment: ['environment:network', 'environment:network'],
			}),
		).toThrow(
			new TypeError('Duplicate plugin environment claim: environment:network'),
		)
	})
})
