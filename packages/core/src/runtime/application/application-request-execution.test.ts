import { FrameworkApplication } from '../../foundation.js'
import { RequestContextValue } from '../../access/index.js'
import { describe, expect, it, vi } from 'vitest'

import { getCurrentRequest } from '../context/active-framework-context.js'
import { RequestContext } from '../context/request-context.js'
import { MasterAuthority } from '../master/master-authority.js'
import { defineOperationTransport } from '../plugin-operations/capabilities.js'
import {
	createRequestExecutionDatabasePlugin as createDatabasePlugin,
	createRequestExecutionHarnessPlugin as createHarnessPlugin,
	readRequestExecutionHarness as readHarness,
	runAsRequestExecutionHarness as runAsHarness,
	type RequestExecutionHarness,
} from '../../../tests/runtime/fixtures/application-request-execution-harness.js'
import { UltimaBase } from './ultima-base.js'
describe('applicationRequestExecutionCapability', () => {
	it('late-binds once, requires completed startup, and expires with the application', async () => {
		const unboundHarness: RequestExecutionHarness = {}
		const application = new FrameworkApplication({
			schemas: [],
			plugins: [createHarnessPlugin(unboundHarness), createDatabasePlugin()],
		})
		await application.initialize()
		expect(() =>
			runAsHarness(unboundHarness, (executor) =>
				executor.createAnonymousContext({
					requestId: 'before-binding',
					source: 'fixture',
				}),
			),
		).toThrow(new TypeError('Application request executor is not bound'))
		await application.dispose()

		const failedHarness: RequestExecutionHarness = {}
		const failed = new UltimaBase({
			schemas: [],
			plugins: [
				createHarnessPlugin(failedHarness, { failStart: true }),
				createDatabasePlugin(),
			],
		})
		await expect(failed.start()).rejects.toThrow(
			/requires a started application; received starting/u,
		)
		expect(() =>
			runAsHarness(failedHarness, (executor) =>
				executor.createAnonymousContext({
					requestId: 'failed-startup',
					source: 'fixture',
				}),
			),
		).toThrow(
			new TypeError('Application request executor is no longer available'),
		)

		const startedHarness: RequestExecutionHarness = {}
		const started = new UltimaBase({
			schemas: [],
			plugins: [createHarnessPlugin(startedHarness), createDatabasePlugin()],
		})
		await started.start()
		expect(
			runAsHarness(startedHarness, (executor) =>
				executor.createAnonymousContext({
					requestId: 'started',
					source: 'fixture',
				}),
			).requestId,
		).toBe('started')
		await started.stop()
		expect(() =>
			runAsHarness(startedHarness, (executor) =>
				executor.createAnonymousContext({
					requestId: 'stopped',
					source: 'fixture',
				}),
			),
		).toThrow(/requires a started application; received stopped/u)
		await started.dispose()
		expect(() =>
			runAsHarness(startedHarness, (executor) =>
				executor.createAnonymousContext({
					requestId: 'disposed',
					source: 'fixture',
				}),
			),
		).toThrow(/no longer available/u)
	})

	it('creates exact anonymous contexts and enters their cancellable request scope', async () => {
		const harness: RequestExecutionHarness = {}
		const ultimabase = new UltimaBase({
			schemas: [],
			plugins: [createHarnessPlugin(harness), createDatabasePlugin()],
		})
		await ultimabase.start()
		const principal = new RequestContextValue<string>(
			'fixture.request-principal',
			(value) => {
				if (typeof value !== 'string') throw new TypeError('Expected a string')
				return value
			},
		)

		const context = runAsHarness(harness, (executor) =>
			executor
				.createAnonymousContext({
					requestId: 'anonymous-request',
					source: 'fixture-http',
				})
				.withValue(principal, 'user-1'),
		)
		const result = await runAsHarness(harness, (executor) =>
			executor.runWithContext(context, async (exactContext) => {
				await Promise.resolve()
				expect(getCurrentRequest()).toBe(exactContext)
				expect(exactContext.getValue(principal)).toBe('user-1')
				return { requestId: exactContext.requestId } as const
			}),
		)
		expect(result).toStrictEqual({ requestId: 'anonymous-request' })

		const controller = new AbortController()
		const cancelled = runAsHarness(harness, (executor) =>
			executor.createAnonymousContext({
				requestId: 'cancelled-request',
				signal: controller.signal,
				source: 'fixture-http',
			}),
		)
		controller.abort('client disconnected')
		const callback = vi.fn<() => void>()
		expect(() => {
			runAsHarness(harness, (executor) => {
				executor.runWithContext(cancelled, callback)
			})
		}).toThrow(/cancelled/u)
		expect(callback).not.toHaveBeenCalled()

		expect(() => {
			readHarness(harness).executor.runWithContext(context, () => undefined)
		}).toThrow(/requires an attributed plugin callback/u)
		await ultimabase.dispose()
	})

	it('shares public-protection diagnostics and delegates explicit operation exposure', async () => {
		const harness: RequestExecutionHarness = {}
		const ultimabase = new UltimaBase({
			schemas: [],
			plugins: [createHarnessPlugin(harness), createDatabasePlugin()],
		})
		const protocol = defineOperationTransport({
			name: 'fixture.application-request-transport',
			version: '1.0.0',
		})
		const warning = vi
			.spyOn(console, 'warn')
			.mockImplementation(() => undefined)
		await ultimabase.start()

		runAsHarness(harness, (executor) => {
			executor.reportPublicTransportProtection({ transport: protocol })
			executor.reportPublicTransportProtection({ transport: protocol })
			executor.reportPublicTransportProtection({
				acknowledgeUnverifiedProtection: true,
				transport: protocol,
			})
		})
		expect(warning).toHaveBeenCalledOnce()
		expect(warning.mock.calls[0]?.[1]).toMatchObject({
			code: 'UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION',
			transport: { name: protocol.name, version: protocol.version },
		})
		expect(() =>
			runAsHarness(harness, (executor) =>
				executor.exposeOperations({ operations: [], transport: protocol }),
			),
		).toThrow(/non-empty operation list/u)

		await ultimabase.stop()
		expect(() => {
			runAsHarness(harness, (executor) => {
				executor.reportPublicTransportProtection({ transport: protocol })
			})
		}).toThrow(/Framework engine cannot be used while application is stopped/u)
		warning.mockRestore()
		await ultimabase.dispose()
	})

	it('rejects contexts from another application before entering the callback', async () => {
		const firstHarness: RequestExecutionHarness = {}
		const secondHarness: RequestExecutionHarness = {}
		const first = new UltimaBase({
			schemas: [],
			plugins: [
				createHarnessPlugin(firstHarness, {
					pluginId: 'fixture.first-consumer',
				}),
				createDatabasePlugin(),
			],
		})
		const second = new UltimaBase({
			schemas: [],
			plugins: [
				createHarnessPlugin(secondHarness, {
					pluginId: 'fixture.second-consumer',
				}),
				createDatabasePlugin(),
			],
		})
		await Promise.all([first.start(), second.start()])
		const foreignContext = runAsHarness(firstHarness, (executor) =>
			executor.createAnonymousContext({
				requestId: 'foreign-context',
				source: 'fixture',
			}),
		)
		const callback = vi.fn<() => void>()
		expect(() => {
			runAsHarness(secondHarness, (executor) => {
				executor.runWithContext(foreignContext, callback)
			})
		}).toThrow(/belongs to another application/u)
		expect(callback).not.toHaveBeenCalled()
		await Promise.all([first.dispose(), second.dispose()])
	})

	it('checks exact owner elevation before verification and returns only an audited Master context', async () => {
		const deniedHarness: RequestExecutionHarness = {}
		const deniedAudits = vi.fn()
		const denied = new UltimaBase({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'denied', value: 'denied-secret' }],
				onUse: deniedAudits,
			}),
			schemas: [],
			plugins: [
				createHarnessPlugin(deniedHarness, {
					pluginId: 'fixture.denied-master-consumer',
				}),
				createDatabasePlugin(),
			],
		})
		await denied.start()
		const unboundContext = RequestContext.anonymous({
			requestId: 'denied-master',
			source: 'fixture-http',
		})
		await expect(
			runAsHarness(deniedHarness, (executor) =>
				executor.verifyMasterKey({
					context: unboundContext,
					rawKey: 'denied-secret',
					reason: 'Denied transport Master verification',
				}),
			),
		).rejects.toMatchObject({
			code: 'PLUGIN_PRIVILEGE_DENIED',
			internalDetails: {
				identity: { pluginId: 'fixture.denied-master-consumer' },
				privilege: 'authority:elevate',
			},
		})
		expect(deniedAudits).not.toHaveBeenCalled()

		const allowedHarness: RequestExecutionHarness = {}
		const allowedAudits = vi.fn()
		const allowed = new UltimaBase({
			masterAuthority: new MasterAuthority({
				clock: () => new Date('2026-09-04T10:00:00.000Z'),
				keys: [{ id: 'browser-tests', value: 'allowed-secret' }],
				onUse: allowedAudits,
			}),
			schemas: [],
			plugins: [
				createHarnessPlugin(allowedHarness, {
					pluginId: 'fixture.allowed-master-consumer',
					withElevation: true,
				}),
				createDatabasePlugin(),
			],
		})
		await allowed.start()

		// The denied attempt did not bind the context to the rejected application.
		const master = await runAsHarness(allowedHarness, (executor) =>
			executor.verifyMasterKey({
				context: unboundContext,
				rawKey: 'allowed-secret',
				reason: 'Front-end integration test',
			}),
		)
		expect(master.access).toStrictEqual({
			keyId: 'browser-tests',
			mode: 'master',
			reason: 'Front-end integration test',
		})
		expect(master.requestId).toBe('denied-master')
		expect(allowedAudits).toHaveBeenCalledWith({
			keyId: 'browser-tests',
			kind: 'master-access',
			occurredAt: '2026-09-04T10:00:00.000Z',
			previousAccess: { mode: 'anonymous' },
			reason: 'Front-end integration test',
			requestId: 'denied-master',
			source: 'fixture-http',
		})
		await expect(
			readHarness(allowedHarness).executor.verifyMasterKey({
				context: unboundContext,
				rawKey: 'allowed-secret',
				reason: 'Unattributed verification',
			}),
		).rejects.toMatchObject({ code: 'PLUGIN_PRIVILEGE_DENIED' })
		await expect(
			runAsHarness(allowedHarness, (executor) =>
				executor.verifyMasterKey({
					context: unboundContext,
					rawKey: 'wrong-secret',
					reason: 'Invalid credential fixture',
				}),
			),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		expect(allowedAudits).toHaveBeenCalledOnce()
		expect(
			runAsHarness(allowedHarness, (executor) =>
				executor.runWithContext(master, (context) => context.access.mode),
			),
		).toBe('master')

		await Promise.all([denied.dispose(), allowed.dispose()])
	})

	it('rejects missing authority, audit failures, foreign Master, and forged Master before request work', async () => {
		const missingHarness: RequestExecutionHarness = {}
		const missing = new UltimaBase({
			schemas: [],
			plugins: [
				createHarnessPlugin(missingHarness, {
					pluginId: 'fixture.missing-master-consumer',
					withElevation: true,
				}),
				createDatabasePlugin(),
			],
		})
		await missing.start()
		const missingContext = runAsHarness(missingHarness, (executor) =>
			executor.createAnonymousContext({
				requestId: 'missing-authority',
				source: 'fixture',
			}),
		)
		await expect(
			runAsHarness(missingHarness, (executor) =>
				executor.verifyMasterKey({
					context: missingContext,
					rawKey: 'unknown',
					reason: 'Missing authority fixture',
				}),
			),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })

		const failingHarness: RequestExecutionHarness = {}
		const auditFailure = new Error('audit sink unavailable')
		const failing = new UltimaBase({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'audit', value: 'audit-secret' }],
				onUse: () => {
					throw auditFailure
				},
			}),
			schemas: [],
			plugins: [
				createHarnessPlugin(failingHarness, {
					pluginId: 'fixture.failing-audit-consumer',
					withElevation: true,
				}),
				createDatabasePlugin(),
			],
		})
		await failing.start()
		const failingContext = runAsHarness(failingHarness, (executor) =>
			executor.createAnonymousContext({
				requestId: 'failing-audit',
				source: 'fixture',
			}),
		)
		await expect(
			runAsHarness(failingHarness, (executor) =>
				executor.verifyMasterKey({
					context: failingContext,
					rawKey: 'audit-secret',
					reason: 'Audit failure fixture',
				}),
			),
		).rejects.toBe(auditFailure)

		const owningHarness: RequestExecutionHarness = {}
		const owning = new UltimaBase({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'owning', value: 'owning-secret' }],
				onUse: () => undefined,
			}),
			schemas: [],
			plugins: [
				createHarnessPlugin(owningHarness, {
					pluginId: 'fixture.owning-master-consumer',
					withElevation: true,
				}),
				createDatabasePlugin(),
			],
		})
		await owning.start()
		const owningContext = runAsHarness(owningHarness, (executor) =>
			executor.createAnonymousContext({
				requestId: 'owning-master',
				source: 'fixture',
			}),
		)
		const owningMaster = await runAsHarness(owningHarness, (executor) =>
			executor.verifyMasterKey({
				context: owningContext,
				rawKey: 'owning-secret',
				reason: 'Owning fixture',
			}),
		)
		const callback = vi.fn<() => void>()
		expect(() => {
			runAsHarness(failingHarness, (executor) => {
				executor.runWithContext(owningMaster, callback)
			})
		}).toThrow(/master context was not issued by this application authority/iu)
		expect(callback).not.toHaveBeenCalled()

		const forgedMaster = Object.assign(
			Object.create(RequestContext.prototype) as RequestContext,
			{
				access: {
					keyId: 'forged',
					mode: 'master' as const,
					reason: 'forged',
				},
				capabilities: [],
				metadata: {},
				requestId: 'forged-master',
				signal: new AbortController().signal,
				source: 'fixture',
			},
		)
		expect(() => {
			runAsHarness(owningHarness, (executor) => {
				executor.runWithContext(forgedMaster, callback)
			})
		}).toThrow(/master context was not issued by this application authority/iu)
		expect(callback).not.toHaveBeenCalled()
		await Promise.all([missing.dispose(), failing.dispose(), owning.dispose()])
	})
})
