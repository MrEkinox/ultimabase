import { describe, expect, it } from 'vitest'

import {
	plugin as createPlugin,
	contributeApplication,
	contributeDeclarations,
	withPluginPrivileges,
} from '../index.js'
import {
	pluginEnvironmentClaimMetadata,
	pluginPrivilegeMetadata,
} from './manifest.js'

const observeContribution = () =>
	withPluginPrivileges(
		contributeApplication(() => ({ exports: undefined })),
		['runtime:observe'],
	)

describe('plugin manifests', () => {
	it('publishes the complete privilege vocabulary with facade ownership and severity', () => {
		expect(Object.keys(pluginPrivilegeMetadata)).toStrictEqual([
			'schema:declare',
			'storage:private',
			'model:extend',
			'operation:declare',
			'runtime:observe',
			'runtime:intercept',
			'runtime:constrain',
			'persistence:rewrite',
			'transport:expose',
			'event:publish',
			'typegen:reference',
			'authority:elevate',
		])
		expect(
			Object.entries(pluginPrivilegeMetadata)
				.filter(([, metadata]) => metadata.severity === 'critical')
				.map(([name]) => name),
		).toStrictEqual(['storage:private', 'authority:elevate'])
		for (const metadata of Object.values(pluginPrivilegeMetadata)) {
			expect(metadata.facade).toBeTruthy()
			expect(['standard', 'sensitive', 'critical']).toContain(metadata.severity)
			expect(Object.isFrozen(metadata)).toBe(true)
		}
		expect(Object.isFrozen(pluginPrivilegeMetadata)).toBe(true)
	})

	it.each([
		'schema:transform',
		'query:extend',
		'typegen:contribute',
		'typegen:emit',
	])('rejects the retired %s privilege before declaration', (name) => {
		let declared = false
		expect(() =>
			createPlugin({
				core: '^0.0.0',
				id: 'fixture.retired-declaration-power',
				version: '1.0.0',
				permissions: {
					[name]: 'Exercises a removed privilege.',
				} as never,
				contributions: [
					withPluginPrivileges(
						contributeApplication(() => {
							declared = true
							return { exports: undefined }
						}),
						[name as never],
					),
				],
			}),
		).toThrow()
		expect(declared).toBe(false)
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

	it('keeps separate manifests and privilege requests owner-scoped', () => {
		const child = createPlugin({
			id: 'fixture.child',
			version: '2.0.0',
			core: '^0.0.0',
			permissions: { 'runtime:observe': 'Records child activity.' },
			contributions: [observeContribution()],
		})
		const parent = createPlugin({
			id: 'fixture.parent',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: { 'schema:declare': 'Declares parent schemas.' },
			contributions: [
				contributeDeclarations({
					schema: () => undefined,
				}),
			],
		})

		expect(parent.manifest.privileges).toStrictEqual([
			{ name: 'schema:declare', reason: 'Declares parent schemas.' },
		])
		expect(child.manifest.privileges).toStrictEqual([
			{ name: 'runtime:observe', reason: 'Records child activity.' },
		])
	})

	it.each([
		[
			{ id: 'unnamespaced', version: '1.0.0', core: '^0.0.0' },
			'pluginId must be a namespaced plugin identifier',
		],
		[
			{
				id: 'fixture.plugin',
				instanceId: '',
				version: '1.0.0',
				core: '^0.0.0',
			},
			'instanceId must be a non-empty string',
		],
		[
			{ id: 'fixture.plugin', version: 'v1.0.0', core: '^0.0.0' },
			'version must be a canonical semantic version',
		],
		[
			{ id: 'fixture.plugin', version: '1.0.0', core: 'later' },
			'core must be a valid semantic version range',
		],
	] as const)(
		'rejects malformed identity and SemVer metadata',
		(options, message) => {
			expect(() => createPlugin({ ...options, contributions: [] })).toThrow(
				new TypeError(message),
			)
		},
	)

	it('rejects malformed, wildcard, and unexplained permission reasons', () => {
		const base = {
			id: 'fixture.plugin',
			version: '1.0.0',
			core: '^0.0.0',
		} as const

		expect(() =>
			createPlugin({
				...base,
				// @ts-expect-error -- Runtime validation protects JavaScript callers.
				permissions: 'runtime:observe',
				contributions: [observeContribution()],
			}),
		).toThrow(new TypeError('plugin permissions must be a plain object'))
		expect(() =>
			createPlugin({
				...base,
				permissions: { 'runtime:*': 'Too broad.' } as never,
				contributions: [observeContribution()],
			}),
		).toThrow(new TypeError('Unknown plugin permission reason: runtime:*'))
		expect(() =>
			createPlugin({
				...base,
				permissions: { 'runtime:observe': '' },
				contributions: [observeContribution()],
			}),
		).toThrow(
			new TypeError(
				'plugin permissions.runtime:observe must be a non-empty string',
			),
		)
	})

	it('rejects the removed migration privilege before declaration effects', () => {
		const effects: string[] = []
		expect(() =>
			createPlugin({
				id: 'fixture.removed-migration-privilege',
				version: '1.0.0',
				core: '^0.0.0',
				permissions: {
					'migration:contribute': 'Former migration fixture.',
				} as never,
				contributions: [
					withPluginPrivileges(
						contributeApplication(() => {
							effects.push('setup')
							return { exports: undefined }
						}),
						// ADR-0266 removes this privilege from typed and untyped manifests.
						['migration:contribute' as never],
					),
				],
			}),
		).toThrow('must be a concrete PluginPrivilege')
		expect(effects).toStrictEqual([])
	})

	it('rejects unknown and duplicate environmental claims independently', () => {
		const base = {
			id: 'fixture.plugin',
			version: '1.0.0',
			core: '^0.0.0',
		} as const

		expect(() =>
			createPlugin({
				...base,
				// @ts-expect-error -- Runtime validation protects JavaScript callers.
				environment: ['environment:camera'],
				contributions: [],
			}),
		).toThrow(
			new TypeError('environment[0] must be a concrete PluginEnvironmentClaim'),
		)
		expect(() =>
			createPlugin({
				...base,
				environment: ['environment:network', 'environment:network'],
				contributions: [],
			}),
		).toThrow(
			new TypeError('Duplicate plugin environment claim: environment:network'),
		)
	})
})
