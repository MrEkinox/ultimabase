import { describe, expect, it, vi } from 'vitest'

import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import {
	MasterAuthority,
	getCurrentRequest,
	getRequestPrincipal,
	isAuthenticated,
	plugin,
	provideCapability,
	requestPrincipalResolverCapability,
	runWithRequestEngine,
	type RequestPrincipalResolver,
} from '../../index.js'
import { UltimaBase } from '../application/ultima-base.js'
import {
	anonymous,
	authorizeMasterKey,
} from '../application/plugin-authority.js'
import { RequestContext, requestSources } from '../../plugin.js'

const Member = UltimaBase.Schema.define({
	className: 'PrincipalMember',
	fields: (field) => ({ name: field.string() }),
})
const Foreign = UltimaBase.Schema.define({
	className: 'PrincipalMember',
	fields: (field) => ({ name: field.string() }),
})
const memberId = '0199c2d0-0000-7000-8000-000000000001'

const databasePlugin = () =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.principal-database',
		version: '1.0.0',
		contributions: [
			provideTestDatabaseAdapter(new RecordingDatabaseAdapter([], [])),
		],
	})

const providerPlugin = (resolver: RequestPrincipalResolver) =>
	plugin({
		core: '^0.0.0',
		id: 'fixture.principal-provider',
		version: '1.0.0',
		contributions: [
			provideCapability(requestPrincipalResolverCapability, {
				contributionId: 'principal',
				create: () => ({ value: resolver }),
			}),
		],
	})

const startApplication = async (resolver?: RequestPrincipalResolver) => {
	const Application = UltimaBase.use(
		databasePlugin(),
		...(resolver === undefined ? [] : [providerPlugin(resolver)]),
	)
	const ultimabase = new Application({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'principal-test', value: 'principal-test-secret' }],
			onUse: () => undefined,
		}),
		logger: false,
		schemas: [Member],
	})
	await ultimabase.start()
	return ultimabase
}

const anonymousContext = (requestId: string) =>
	RequestContext.anonymous({ requestId, source: requestSources.internal })

describe('request principal (ADR-0304)', () => {
	it('is undefined without a provider and outside a request', async () => {
		await using ultimabase = await startApplication()
		const engine = anonymous(ultimabase, {
			requestId: 'no-provider',
			source: requestSources.internal,
		})

		await expect(getRequestPrincipal(engine.context)).resolves.toBeUndefined()
		// An unbound context belongs to no application, so it has no provider.
		await expect(
			getRequestPrincipal(anonymousContext('unbound')),
		).resolves.toBeUndefined()
	})

	it('resolves once per request context and keeps it under Master', async () => {
		const resolveCurrent = vi.fn(() => Member.pointer(memberId))
		await using ultimabase = await startApplication({ resolveCurrent })
		const engine = anonymous(ultimabase, {
			requestId: 'one-resolution',
			source: requestSources.internal,
		})

		const first = await getRequestPrincipal(engine.context)
		const second = await runWithRequestEngine(engine, () =>
			getRequestPrincipal(getCurrentRequest()),
		)
		const master = await engine.useMasterKey(
			authorizeMasterKey(ultimabase, 'principal-test-secret'),
			'principal test',
		)

		expect(first?.id).toBe(memberId)
		expect(second).toBe(first)
		expect(master.context.access.mode).toBe('master')
		// Master changes authority, not identity.
		await expect(getRequestPrincipal(master.context)).resolves.toBe(first)
		expect(resolveCurrent).toHaveBeenCalledTimes(1)
	})

	it('uses an explicit principal, anonymous included, instead of the provider', async () => {
		const resolveCurrent = vi.fn(() => Member.pointer(memberId))
		await using ultimabase = await startApplication({ resolveCurrent })
		const engine = anonymous(ultimabase, {
			requestId: 'explicit',
			source: requestSources.internal,
		})
		const other = Member.pointer('0199c2d0-0000-7000-8000-000000000002')

		await expect(
			getRequestPrincipal(engine.context.withPrincipal(other)),
		).resolves.toBe(other)
		await expect(
			getRequestPrincipal(engine.context.withPrincipal(undefined)),
		).resolves.toBeUndefined()
		expect(resolveCurrent).not.toHaveBeenCalled()
	})

	it('rejects forged and foreign principals', async () => {
		await using forged = await startApplication({
			resolveCurrent: () => ({ id: 'forged' }) as never,
		})
		const forgedEngine = anonymous(forged, {
			requestId: 'forged',
			source: requestSources.internal,
		})
		await expect(getRequestPrincipal(forgedEngine.context)).rejects.toThrow(
			new TypeError('Request principal must be a Core Pointer'),
		)
		await forged.dispose()

		await using foreign = await startApplication({
			resolveCurrent: () => Foreign.pointer(memberId),
		})
		const foreignEngine = anonymous(foreign, {
			requestId: 'foreign',
			source: requestSources.internal,
		})
		await expect(getRequestPrincipal(foreignEngine.context)).rejects.toThrow(
			new TypeError(
				'Request principal belongs to a foreign application schema',
			),
		)
	})

	it('provides isAuthenticated as a named predicate of the principal alone', async () => {
		expect(isAuthenticated.name).toBe('isAuthenticated')
		await expect(
			Promise.resolve(
				isAuthenticated({
					operation: 'create',
					principal: undefined,
					schema: 'Todo',
				}),
			),
		).resolves.toBe(false)
		expect(
			isAuthenticated({
				operation: 'create',
				principal: Member.pointer(memberId),
				schema: 'Todo',
			}),
		).toBe(true)
	})
})
