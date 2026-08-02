import { FrameworkError } from '../../foundation.js'
import { describe, expect, it } from 'vitest'

import {
	createTrustedMasterRequestContext,
	RequestContext,
	requestSources,
} from '../context/request-context.js'
import {
	MasterAuthority,
	type MasterAuthorityOptions,
} from './master-authority.js'

const createAuthority = (
	overrides: Partial<MasterAuthorityOptions> = {},
): MasterAuthority =>
	new MasterAuthority({
		clock: () => new Date('2026-08-01T04:00:00.000Z'),
		keys: [
			{ id: 'primary', value: 'primary-secret' },
			{ id: 'worker', value: 'worker-secret' },
		],
		onUse: () => undefined,
		...overrides,
	})

describe('MasterAuthority', () => {
	it('turns matching raw keys into immutable authority-owned grants', () => {
		const authority = createAuthority()
		const grant = authority.authorize('worker-secret')

		expect(grant.keyId).toBe('worker')
		expect(Object.isFrozen(grant)).toBe(true)
		expect(JSON.stringify(authority)).not.toContain('worker-secret')
		expect(() => authority.authorize('incorrect-secret')).toThrow(
			expect.objectContaining({ code: 'PERMISSION_DENIED' }),
		)
		expect(() => authority.authorize('')).toThrow(
			new TypeError('Master key must be a non-empty string'),
		)
	})

	it('uses a valid current timestamp when no clock is injected', async () => {
		const events: { readonly occurredAt: string }[] = []
		const authority = new MasterAuthority({
			keys: [{ id: 'default-clock', value: 'clock-secret' }],
			onUse: (event) => {
				events.push(event)
			},
		})
		const context = RequestContext.anonymous({
			requestId: 'default-clock',
			source: requestSources.internal,
		})

		await authority.elevate(
			authority.authorize('clock-secret'),
			context,
			'test default clock',
		)

		expect(Date.parse(events[0]?.occurredAt ?? '')).not.toBeNaN()
	})

	it('audits immutable safe metadata before creating master context', async () => {
		const events: unknown[] = []
		const authority = createAuthority({
			onUse: (event) => {
				expect(Object.isFrozen(event)).toBe(true)
				events.push(event)
			},
		})
		const context = RequestContext.user('operator-1', {
			metadata: { traceId: 'trace-1' },
			requestId: 'master-request-1',
			source: requestSources.job,
		})
		const grant = authority.authorize('primary-secret')
		const master = await authority.elevate(grant, context, 'repair indexes')

		expect(master.access).toStrictEqual({
			keyId: 'primary',
			mode: 'master',
			reason: 'repair indexes',
		})
		expect(master.metadata).toStrictEqual({ traceId: 'trace-1' })
		expect(events).toStrictEqual([
			{
				keyId: 'primary',
				kind: 'master-access',
				occurredAt: '2026-08-01T04:00:00.000Z',
				previousAccess: { mode: 'user', userId: 'operator-1' },
				reason: 'repair indexes',
				requestId: 'master-request-1',
				source: 'job',
			},
		])
	})

	it('rejects forged and foreign grants before auditing', async () => {
		let auditCalls = 0
		const authority = createAuthority({
			onUse: () => {
				auditCalls += 1
			},
		})
		const foreignAuthority = createAuthority()
		const context = RequestContext.anonymous({
			requestId: 'master-request-2',
			source: requestSources.internal,
		})

		await expect(
			authority.elevate(
				foreignAuthority.authorize('primary-secret'),
				context,
				'forged use',
			),
		).rejects.toBeInstanceOf(FrameworkError)
		await expect(
			authority.elevate({ keyId: 'primary' } as never, context, 'forged use'),
		).rejects.toBeInstanceOf(FrameworkError)
		expect(auditCalls).toBe(0)
	})

	it('requires audit success, a reason, and a valid operation clock', async () => {
		const context = createTrustedMasterRequestContext(
			'existing authority',
			'primary',
			{
				requestId: 'master-request-3',
				source: requestSources.internal,
			},
		)
		const auditError = new Error('audit unavailable')
		const failingAuthority = createAuthority({
			onUse: () => {
				throw auditError
			},
		})
		const invalidClockAuthority = createAuthority({
			clock: () => new Date(Number.NaN),
		})

		await expect(
			failingAuthority.elevate(
				failingAuthority.authorize('primary-secret'),
				context,
				'audited use',
			),
		).rejects.toBe(auditError)
		await expect(
			failingAuthority.elevate(
				failingAuthority.authorize('primary-secret'),
				context,
				'',
			),
		).rejects.toThrow(
			new TypeError('Master access reason must be a non-empty string'),
		)
		await expect(
			invalidClockAuthority.elevate(
				invalidClockAuthority.authorize('primary-secret'),
				context,
				'timed use',
			),
		).rejects.toThrow(
			new TypeError('Master authority clock must return a valid Date'),
		)
	})

	it('rejects malformed and ambiguous configuration', () => {
		const invalidCases: readonly {
			readonly create: () => unknown
			readonly message: string
		}[] = [
			{
				create: () => new MasterAuthority(null as never),
				message: 'Master authority options must be a plain object',
			},
			{
				create: () =>
					new MasterAuthority({
						keys: [],
						onUse: () => undefined,
						extra: true,
					} as never),
				message: 'Master authority contains unknown key: extra',
			},
			{
				create: () => new MasterAuthority({ keys: [], onUse: true } as never),
				message: 'Master authority onUse must be a function',
			},
			{
				create: () =>
					new MasterAuthority({
						clock: true,
						keys: [],
						onUse: () => undefined,
					} as never),
				message: 'Master authority clock must be a function',
			},
			{
				create: () => new MasterAuthority({ keys: [], onUse: () => undefined }),
				message: 'Master authority keys must be a non-empty array',
			},
			{
				create: () =>
					new MasterAuthority({
						keys: [null] as never,
						onUse: () => undefined,
					}),
				message: 'Master authority keys[0] must be a plain object',
			},
			{
				create: () =>
					new MasterAuthority({ keys: [{}] as never, onUse: () => undefined }),
				message: 'Master key id must be a non-empty string',
			},
			{
				create: () =>
					new MasterAuthority({
						keys: [
							{ id: 'duplicate', value: 'first' },
							{ id: 'duplicate', value: 'second' },
						],
						onUse: () => undefined,
					}),
				message: 'Duplicate master key id: duplicate',
			},
			{
				create: () =>
					new MasterAuthority({
						keys: [
							{ id: 'first', value: 'duplicate' },
							{ id: 'second', value: 'duplicate' },
						],
						onUse: () => undefined,
					}),
				message: 'Duplicate master key value',
			},
		]

		for (const invalidCase of invalidCases) {
			expect(invalidCase.create).toThrow(new TypeError(invalidCase.message))
		}
	})
})
