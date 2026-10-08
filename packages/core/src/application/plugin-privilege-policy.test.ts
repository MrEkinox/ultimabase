import { describe, expect, it, vi } from 'vitest'

import { FrameworkError } from '../errors/framework-error.js'
import {
	defineCapability,
	optionalCapability,
	provideCapability,
} from '../plugins/capabilities.js'
import { plugin as createPlugin } from '../plugins/plugin.js'
import {
	contributeApplication,
	withPluginPrivileges,
} from '../plugins/plugin-contributions.js'
import {
	pluginPrivilegeMetadata,
	type PluginPrivilege,
} from '../plugins/manifest.js'
import { UltimaBase } from '../runtime/application/ultima-base.js'
import { FrameworkApplication } from './framework-application.js'
import type {
	PluginPrivilegeLogger,
	PluginPrivilegeReport,
} from './plugin-privilege-policy.js'

const optionalAuditToken = defineCapability<{
	readonly record: (message: string) => void
}>()({
	capabilityId: 'fixture.optional-audit',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([provider]) => provider,
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

describe('plugin privilege policy', () => {
	it.each(Object.keys(pluginPrivilegeMetadata) as PluginPrivilege[])(
		'blocks retained privilege %s before plugin effects',
		(privilege) => {
			const setup = vi.fn()
			const plugin = createPlugin({
				core: '^0.0.0',
				id: `fixture.denied-${privilege.replace(':', '-')}`,
				permissions: { [privilege]: 'Boundary denial fixture.' },
				version: '1.0.0',
				contributions: [
					withPluginPrivileges(
						contributeApplication(() => {
							setup()
							return { exports: undefined }
						}),
						[privilege],
					),
				],
			})

			expect(
				() =>
					new FrameworkApplication({
						pluginPrivileges: { deny: [privilege], logger: false },
						plugins: [plugin],
						schemas: [],
					}),
			).toThrow(expect.objectContaining({ code: 'PLUGIN_PRIVILEGE_DENIED' }))
			expect(setup).not.toHaveBeenCalled()
		},
	)

	it('forwards the same policy and report through UltimaBase', () => {
		const plugin = createPlugin({
			id: 'fixture.ultimabase-policy',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: { 'runtime:observe': 'Facade forwarding fixture.' },
			contributions: [
				withPluginPrivileges(
					contributeApplication(() => ({ exports: undefined })),
					['runtime:observe'],
				),
			],
		})
		const ultimabase = new (UltimaBase.use(plugin))({
			schemas: [],
			pluginPrivileges: { logger: false },
		})

		expect(ultimabase.pluginPrivilegeReport.allowed).toBe(true)
		expect(ultimabase.pluginPrivilegeReport.plugins[0]?.identity).toStrictEqual(
			{ pluginId: 'fixture.ultimabase-policy' },
		)
	})

	it('allows requested privileges by default and exposes one detached ordered report', () => {
		const reports: PluginPrivilegeReport[] = []
		const dependency = createPlugin({
			id: 'fixture.policy-dependency',
			version: '2.1.0',
			core: '^0.0.0',
			permissions: { 'runtime:observe': 'Records safe operation timings.' },
			environment: ['environment:process'],
			contributions: [
				withPluginPrivileges(
					contributeApplication(() => ({ exports: undefined })),
					['runtime:observe'],
				),
			],
		})
		const consumer = createPlugin({
			id: 'fixture.policy-consumer',
			version: '1.0.0',
			core: '^0.0.0',
			dependencies: [
				{ pluginId: 'fixture.policy-dependency', version: '^2.0.0' },
			],
			permissions: { 'transport:expose': 'Publishes the configured endpoint.' },
			contributions: [
				withPluginPrivileges(
					contributeApplication(() => ({ exports: undefined })),
					['transport:expose'],
				),
			],
		})
		const logger: PluginPrivilegeLogger = {
			info: (report) => reports.push(report),
			error: vi.fn(),
		}

		const application = new FrameworkApplication({
			schemas: [],
			plugins: [consumer, dependency],
			pluginPrivileges: { logger },
		})

		expect(application.pluginPrivilegeReport).toStrictEqual({
			allowed: true,
			plugins: [
				{
					order: 0,
					identity: { pluginId: 'fixture.policy-dependency' },
					version: '2.1.0',
					privileges: [
						{
							name: 'runtime:observe',
							reason: 'Records safe operation timings.',
							severity: 'standard',
							active: true,
							policyResult: 'allowed',
						},
					],
					environment: [
						{
							name: 'environment:process',
							reason: 'Declares direct host process behavior.',
							severity: 'sensitive',
							policyResult: 'allowed',
						},
					],
				},
				{
					order: 1,
					identity: { pluginId: 'fixture.policy-consumer' },
					version: '1.0.0',
					privileges: [
						{
							name: 'transport:expose',
							reason: 'Publishes the configured endpoint.',
							severity: 'sensitive',
							active: true,
							policyResult: 'allowed',
						},
					],
					environment: [],
				},
			],
		})
		expect(reports).toStrictEqual([application.pluginPrivilegeReport])
		expect(Object.isFrozen(application.pluginPrivilegeReport)).toBe(true)
		expect(Object.isFrozen(application.pluginPrivilegeReport.plugins)).toBe(
			true,
		)
		expect(JSON.stringify(application.pluginPrivilegeReport)).not.toContain(
			'capability-provider',
		)
	})

	it('accumulates global, plugin, instance, and claim denials into one error', () => {
		let declarationCalls = 0
		let setupCalls = 0
		const deniedReports: PluginPrivilegeReport[] = []
		const logger = {
			info: vi.fn(),
			error: vi.fn((report: PluginPrivilegeReport): void => {
				deniedReports.push(report)
			}),
		}
		const primary = createPlugin({
			id: 'fixture.policy-database',
			instanceId: 'primary',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: {
				'runtime:observe': 'Global denial fixture.',
				'authority:elevate': 'Instance denial fixture.',
			},
			environment: ['environment:network'],
			contributions: [
				withPluginPrivileges(
					contributeApplication(() => {
						declarationCalls += 1
						setupCalls += 1
						return { exports: undefined }
					}),
					['runtime:observe', 'authority:elevate'],
				),
			],
		})
		const secondary = createPlugin({
			id: 'fixture.policy-database',
			instanceId: 'secondary',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: { 'runtime:observe': 'Second global denial fixture.' },
			contributions: [
				withPluginPrivileges(
					contributeApplication(() => ({ exports: undefined })),
					['runtime:observe'],
				),
			],
		})

		const error = captureFrameworkError(
			() =>
				new FrameworkApplication({
					schemas: [],
					plugins: [primary, secondary],
					pluginPrivileges: {
						deny: ['runtime:observe'],
						plugins: {
							'fixture.policy-database': {
								denyClaims: ['environment:network'],
								instances: {
									primary: { deny: ['authority:elevate'] },
								},
							},
						},
						logger,
					},
				}),
		)

		expect(error.code).toBe('PLUGIN_PRIVILEGE_DENIED')
		expect(error.internalDetails).toStrictEqual({
			denials: [
				{
					blockedPhase: 'before-static-declaration',
					identity: {
						instanceId: 'primary',
						pluginId: 'fixture.policy-database',
					},
					kind: 'privilege',
					plugin: 'fixture.policy-database (instance primary)',
					name: 'runtime:observe',
					reason: 'Global denial fixture.',
					severity: 'standard',
				},
				{
					blockedPhase: 'before-static-declaration',
					identity: {
						instanceId: 'primary',
						pluginId: 'fixture.policy-database',
					},
					kind: 'privilege',
					plugin: 'fixture.policy-database (instance primary)',
					name: 'authority:elevate',
					reason: 'Instance denial fixture.',
					severity: 'critical',
				},
				{
					blockedPhase: 'before-static-declaration',
					identity: {
						instanceId: 'primary',
						pluginId: 'fixture.policy-database',
					},
					kind: 'environment-claim',
					plugin: 'fixture.policy-database (instance primary)',
					name: 'environment:network',
					reason: 'Declares direct host network behavior.',
					severity: 'sensitive',
				},
				{
					blockedPhase: 'before-static-declaration',
					identity: {
						instanceId: 'secondary',
						pluginId: 'fixture.policy-database',
					},
					kind: 'privilege',
					plugin: 'fixture.policy-database (instance secondary)',
					name: 'runtime:observe',
					reason: 'Second global denial fixture.',
					severity: 'standard',
				},
			],
		})
		expect(logger.error).toHaveBeenCalledOnce()
		expect(deniedReports[0]?.plugins[0]?.environment[0]).toStrictEqual({
			blockedPhase: 'before-static-declaration',
			name: 'environment:network',
			policyResult: 'denied',
			reason: 'Declares direct host network behavior.',
			severity: 'sensitive',
		})
		expect(logger.info).not.toHaveBeenCalled()
		expect(declarationCalls).toBe(0)
		expect(setupCalls).toBe(0)
	})

	it('reports denied inactive conditional privileges without failing', () => {
		const optionalAudit = optionalCapability(optionalAuditToken, '^1.0.0')
		const plugin = createPlugin({
			id: 'fixture.conditional-typegen',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: {
				'typegen:reference': {
					reason: 'References audit declarations when installed.',
					when: optionalAudit,
				},
			},
			contributions: [
				withPluginPrivileges(optionalAudit, ['typegen:reference']),
			],
		})

		const application = new FrameworkApplication({
			schemas: [],
			plugins: [plugin],
			pluginPrivileges: {
				deny: ['typegen:reference'],
				logger: false,
			},
		})

		expect(application.pluginPrivilegeReport.allowed).toBe(true)
		expect(
			application.pluginPrivilegeReport.plugins[0]?.privileges[0],
		).toStrictEqual({
			name: 'typegen:reference',
			reason: 'References audit declarations when installed.',
			severity: 'standard',
			active: false,
			policyResult: 'denied',
		})
	})

	it('enforces a conditional privilege when its optional capability is present', () => {
		const optionalAudit = optionalCapability(optionalAuditToken, '^1.0.0')
		const provider = createPlugin({
			id: 'fixture.audit-provider',
			version: '1.0.0',
			core: '^0.0.0',
			contributions: [
				provideCapability(optionalAuditToken, {
					contributionId: 'primary',
					create: () => ({
						value: { record: () => undefined },
					}),
				}),
			],
		})
		const consumer = createPlugin({
			id: 'fixture.active-conditional-typegen',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: {
				'typegen:reference': {
					reason: 'References the installed audit protocol.',
					when: optionalAudit,
				},
			},
			contributions: [
				withPluginPrivileges(optionalAudit, ['typegen:reference']),
			],
		})

		const error = captureFrameworkError(
			() =>
				new FrameworkApplication({
					schemas: [],
					plugins: [consumer, provider],
					pluginPrivileges: {
						deny: ['typegen:reference'],
						logger: false,
					},
				}),
		)

		expect(error.code).toBe('PLUGIN_PRIVILEGE_DENIED')
	})

	it('targets exact plugin instances from the flat graph', () => {
		const child = createPlugin({
			id: 'fixture.nested-policy',
			instanceId: 'editorial',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: { 'transport:expose': 'Nested instance fixture.' },
			contributions: [
				withPluginPrivileges(
					contributeApplication(() => ({ exports: undefined })),
					['transport:expose'],
				),
			],
		})
		const error = captureFrameworkError(
			() =>
				new FrameworkApplication({
					schemas: [],
					plugins: [child],
					pluginPrivileges: {
						plugins: {
							'fixture.nested-policy': {
								instances: {
									editorial: { deny: ['transport:expose'] },
								},
							},
						},
						logger: false,
					},
				}),
		)

		expect(error.internalDetails).toStrictEqual({
			denials: [
				{
					blockedPhase: 'before-static-declaration',
					identity: {
						instanceId: 'editorial',
						pluginId: 'fixture.nested-policy',
					},
					kind: 'privilege',
					plugin: 'fixture.nested-policy (instance editorial)',
					name: 'transport:expose',
					reason: 'Nested instance fixture.',
					severity: 'sensitive',
				},
			],
		})
	})

	it.each([
		[
			{ deny: ['runtime:unknown'], logger: false },
			'pluginPrivileges.deny[0] is unknown: runtime:unknown',
		],
		[
			{ denyClaims: ['environment:camera'], logger: false },
			'pluginPrivileges.denyClaims[0] is unknown: environment:camera',
		],
		[
			{
				plugins: { 'fixture.unknown': { deny: [] } },
				logger: false,
			},
			'pluginPrivileges.plugins targets unknown plugin: fixture.unknown',
		],
		[
			{
				plugins: {
					'fixture.known-policy': {
						instances: { unknown: { deny: [] } },
					},
				},
				logger: false,
			},
			'pluginPrivileges.plugins.fixture.known-policy.instances targets unknown instance: unknown',
		],
	] as const)(
		'rejects policy configuration typos',
		(pluginPrivileges, message) => {
			const plugin = createPlugin({
				id: 'fixture.known-policy',
				instanceId: 'primary',
				version: '1.0.0',
				core: '^0.0.0',
				contributions: [],
			})

			expect(
				() =>
					new FrameworkApplication({
						schemas: [],
						plugins: [plugin],
						pluginPrivileges: pluginPrivileges as never,
					}),
			).toThrow(new TypeError(message))
		},
	)

	it('uses the default result channel and isolates custom logger failures', async () => {
		const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
		const plugin = createPlugin({
			id: 'fixture.console-report',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: { 'runtime:observe': 'Console reporting fixture.' },
			contributions: [
				withPluginPrivileges(
					contributeApplication(() => ({ exports: undefined })),
					['runtime:observe'],
				),
			],
		})

		new FrameworkApplication({ schemas: [], plugins: [plugin] })
		expect(info).toHaveBeenCalledOnce()
		expect(error).not.toHaveBeenCalled()

		new FrameworkApplication({
			schemas: [],
			plugins: [plugin],
			pluginPrivileges: { logger: false },
		})
		expect(info).toHaveBeenCalledOnce()
		expect(error).not.toHaveBeenCalled()

		expect(
			() =>
				new FrameworkApplication({
					schemas: [],
					plugins: [plugin],
					pluginPrivileges: { deny: ['runtime:observe'] },
				}),
		).toThrow(
			expect.objectContaining<Partial<FrameworkError>>({
				code: 'PLUGIN_PRIVILEGE_DENIED',
			}),
		)
		expect(error).toHaveBeenCalledOnce()

		expect(
			() =>
				new FrameworkApplication({
					schemas: [],
					plugins: [plugin],
					pluginPrivileges: {
						deny: ['runtime:observe'],
						logger: {
							info: () => undefined,
							error: () => {
								throw new Error('Logger failure')
							},
						},
					},
				}),
		).toThrow(
			expect.objectContaining<Partial<FrameworkError>>({
				code: 'PLUGIN_PRIVILEGE_DENIED',
			}),
		)

		const asyncFailure = new FrameworkApplication({
			schemas: [],
			plugins: [plugin],
			pluginPrivileges: {
				logger: {
					info: () => Promise.reject(new Error('Async logger failure')),
					error: () => undefined,
				},
			},
		})
		expect(asyncFailure.pluginPrivilegeReport.allowed).toBe(true)
		await Promise.resolve()

		info.mockRestore()
		error.mockRestore()
	})
})
