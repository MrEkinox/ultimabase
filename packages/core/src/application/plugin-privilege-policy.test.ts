import { describe, expect, it, vi } from 'vitest'

import { FrameworkError } from '../errors/framework-error.js'
import {
	defineCapability,
	optionalCapability,
	provideCapability,
} from '../plugins/capabilities.js'
import { definePlugin } from '../plugins/definition.js'
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
			const declaration = vi.fn()
			const setup = vi.fn()
			const plugin = definePlugin({
				core: '^0.0.0',
				pluginId: `fixture.denied-${privilege.replace(':', '-')}`,
				privileges: [{ name: privilege, reason: 'Boundary denial fixture.' }],
				version: '1.0.0',
				declare: declaration,
				setup,
			})

			expect(
				() =>
					new FrameworkApplication({
						pluginPrivileges: { deny: [privilege], logger: false },
						plugins: [plugin],
						schemas: [],
					}),
			).toThrow(expect.objectContaining({ code: 'PLUGIN_PRIVILEGE_DENIED' }))
			expect(declaration).not.toHaveBeenCalled()
			expect(setup).not.toHaveBeenCalled()
		},
	)

	it('forwards the same policy and report through UltimaBase', () => {
		const plugin = definePlugin({
			pluginId: 'fixture.ultimabase-policy',
			version: '1.0.0',
			core: '^0.0.0',
			privileges: [
				{ name: 'runtime:observe', reason: 'Facade forwarding fixture.' },
			],
		})
		const ultimabase = new UltimaBase({
			schemas: [],
			plugins: [plugin],
			pluginPrivileges: { logger: false },
		})

		expect(ultimabase.application.pluginPrivilegeReport.allowed).toBe(true)
		expect(
			ultimabase.application.pluginPrivilegeReport.plugins[0]?.identity,
		).toStrictEqual({ pluginId: 'fixture.ultimabase-policy' })
	})

	it('allows requested privileges by default and exposes one detached ordered report', () => {
		const reports: PluginPrivilegeReport[] = []
		const dependency = definePlugin({
			pluginId: 'fixture.policy-dependency',
			version: '2.1.0',
			core: '^0.0.0',
			privileges: [
				{
					name: 'runtime:observe',
					reason: 'Records safe operation timings.',
				},
			],
			environment: ['environment:process'],
		})
		const consumer = definePlugin({
			pluginId: 'fixture.policy-consumer',
			version: '1.0.0',
			core: '^0.0.0',
			dependencies: [
				{ pluginId: 'fixture.policy-dependency', version: '^2.0.0' },
			],
			privileges: [
				{
					name: 'transport:expose',
					reason: 'Publishes the configured endpoint.',
				},
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
		const primary = definePlugin({
			pluginId: 'fixture.policy-database',
			instanceId: 'primary',
			version: '1.0.0',
			core: '^0.0.0',
			privileges: [
				{ name: 'runtime:observe', reason: 'Global denial fixture.' },
				{ name: 'adapter:raw', reason: 'Instance denial fixture.' },
			],
			environment: ['environment:network'],
			declare: () => {
				declarationCalls += 1
			},
			setup: () => {
				setupCalls += 1
			},
		})
		const secondary = definePlugin({
			pluginId: 'fixture.policy-database',
			instanceId: 'secondary',
			version: '1.0.0',
			core: '^0.0.0',
			privileges: [
				{ name: 'runtime:observe', reason: 'Second global denial fixture.' },
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
									primary: { deny: ['adapter:raw'] },
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
					name: 'adapter:raw',
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
		const plugin = definePlugin({
			pluginId: 'fixture.conditional-typegen',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: [optionalAudit],
			privileges: [
				{
					name: 'typegen:reference',
					reason: 'References audit declarations when installed.',
					when: optionalAudit,
				},
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
		const provider = definePlugin({
			pluginId: 'fixture.audit-provider',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: [
				provideCapability(optionalAuditToken, {
					contributionId: 'primary',
					create: () => ({
						value: { record: () => undefined },
					}),
				}),
			],
		})
		const consumer = definePlugin({
			pluginId: 'fixture.active-conditional-typegen',
			version: '1.0.0',
			core: '^0.0.0',
			capabilities: [optionalAudit],
			privileges: [
				{
					name: 'typegen:reference',
					reason: 'References the installed audit protocol.',
					when: optionalAudit,
				},
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
		const child = definePlugin({
			pluginId: 'fixture.nested-policy',
			instanceId: 'editorial',
			version: '1.0.0',
			core: '^0.0.0',
			privileges: [
				{ name: 'transport:expose', reason: 'Nested instance fixture.' },
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
			const plugin = definePlugin({
				pluginId: 'fixture.known-policy',
				instanceId: 'primary',
				version: '1.0.0',
				core: '^0.0.0',
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
		const plugin = definePlugin({
			pluginId: 'fixture.console-report',
			version: '1.0.0',
			core: '^0.0.0',
			privileges: [
				{ name: 'runtime:observe', reason: 'Console reporting fixture.' },
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
