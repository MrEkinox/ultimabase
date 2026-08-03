import { RequestCapability, RequestContextValue } from '../../access/index.js'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import {
	createTrustedMasterRequestContext,
	RequestContext,
	requestSources,
} from './request-context.js'

interface FixturePrincipal {
	readonly id: string
}

const principalValue = new RequestContextValue<FixturePrincipal>(
	'fixture.principal',
	(value: unknown): FixturePrincipal => {
		if (!isPlainRecord(value) || typeof value.id !== 'string') {
			throw new TypeError('Fixture principal must contain a string id')
		}

		return immutableRecord({ id: value.id })
	},
)

/** Represents an independent plugin value used to prove immutable branching. */
const tenantValue = new RequestContextValue<string>(
	'fixture.tenant',
	(value: unknown): string => {
		if (typeof value !== 'string') {
			throw new TypeError('Fixture tenant must be a string')
		}

		return value
	},
)

describe('RequestContext', () => {
	it('creates immutable anonymous contexts with plugin-owned values', () => {
		const metadata = { trace: 'trace-1' }
		const capability = new RequestCapability('tenant:read')
		const capabilities: RequestCapability[] = [capability]
		const principal = { id: 'user-1' }
		const anonymous = RequestContext.anonymous({
			capabilities,
			metadata,
			requestId: 'request-1',
			source: requestSources.graphql,
		})
		const authenticated = anonymous.withValue(principalValue, principal)

		metadata.trace = 'changed'
		capabilities.push(new RequestCapability('tenant:write'))
		principal.id = 'changed'

		expect(anonymous.access).toStrictEqual({ mode: 'anonymous' })
		expect(anonymous.getValue(principalValue)).toBeUndefined()
		expect(authenticated.access).toBe(anonymous.access)
		expect(authenticated.metadata).toStrictEqual({ trace: 'trace-1' })
		expect(authenticated.capabilities).toStrictEqual([capability])
		expect(authenticated.getValue(principalValue)).toStrictEqual({
			id: 'user-1',
		})
		expect(authenticated.hasCapability(capability)).toBe(true)
		expect(
			authenticated.hasCapability(new RequestCapability('tenant:read')),
		).toBe(false)
		expect(Object.isFrozen(authenticated.access)).toBe(true)
		expect(Object.isFrozen(authenticated.metadata)).toBe(true)
		expect(Object.isFrozen(authenticated.capabilities)).toBe(true)
		expect(Object.isFrozen(authenticated.getValue(principalValue))).toBe(true)
		expect(Object.isFrozen(authenticated)).toBe(true)
	})

	it('branches typed values and rejects duplicate or forged tokens', () => {
		const context = RequestContext.anonymous({
			requestId: 'request-values',
			source: requestSources.internal,
		})
		const authenticated = context.withValue(principalValue, { id: 'user-1' })
		const tenantScoped = authenticated.withValue(tenantValue, 'tenant-1')

		expect(authenticated.getValue(tenantValue)).toBeUndefined()
		expect(tenantScoped.getValue(principalValue)).toStrictEqual({
			id: 'user-1',
		})
		expect(tenantScoped.getValue(tenantValue)).toBe('tenant-1')

		expect(() =>
			authenticated.withValue(principalValue, { id: 'user-2' }),
		).toThrow(
			new TypeError('Request context value already exists: fixture.principal'),
		)
		expect(() =>
			context.withValue(principalValue, {
				// @ts-expect-error -- Runtime validation protects JavaScript callers.
				id: 1,
			}),
		).toThrow(new TypeError('Fixture principal must contain a string id'))
		expect(() =>
			context.withValue(
				// @ts-expect-error -- Runtime validation rejects structural token forgeries.
				{ name: 'fixture.principal', snapshot: (value: unknown) => value },
				{ id: 'user-1' },
			),
		).toThrow(
			new TypeError(
				'Request context value token must be a RequestContextValue',
			),
		)
		expect(() =>
			context.getValue(
				// @ts-expect-error -- Runtime validation rejects structural token forgeries.
				{ name: 'fixture.principal', snapshot: (value: unknown) => value },
			),
		).toThrow(
			new TypeError(
				'Request context value token must be a RequestContextValue',
			),
		)
	})

	it('retains custom source literals without changing access semantics', () => {
		const controller = new AbortController()
		const context = RequestContext.anonymous({
			requestId: 'request-grpc',
			signal: controller.signal,
			source: 'grpc',
		})

		expect(context.source).toBe('grpc')
		expect(context.access.mode).toBe('anonymous')
		expect(context.signal).toBe(controller.signal)

		controller.abort()
		expect(context.signal.aborted).toBe(true)
	})

	it('keeps master construction behind the internal trusted boundary', () => {
		const anonymous = RequestContext.anonymous({
			requestId: 'request-master',
			source: requestSources.internal,
		}).withValue(principalValue, { id: 'operator-1' })
		const context = createTrustedMasterRequestContext(
			'repair tenant data',
			'maintenance',
			anonymous,
		)

		expect(context.access).toStrictEqual({
			keyId: 'maintenance',
			mode: 'master',
			reason: 'repair tenant data',
		})
		expect(context.getValue(principalValue)).toStrictEqual({ id: 'operator-1' })
		expect(Object.isFrozen(context.access)).toBe(true)
	})

	it('rejects malformed options, credentials, identities, and capabilities', () => {
		expect(() =>
			RequestContext.anonymous(
				// @ts-expect-error -- Runtime validation protects JavaScript callers.
				null,
			),
		).toThrow(new TypeError('Request context options must be a plain object'))
		expect(() =>
			RequestContext.anonymous({
				requestId: '',
				source: requestSources.rest,
			}),
		).toThrow(
			new TypeError('Request context requestId must be a non-empty string'),
		)
		expect(() =>
			RequestContext.anonymous({
				requestId: 'request-1',
				source: '',
			}),
		).toThrow(
			new TypeError('Request context source must be a non-empty string'),
		)
		expect(() =>
			RequestContext.anonymous({
				requestId: 'request-1',
				source: requestSources.rest,
				// @ts-expect-error -- Raw master keys are not context options.
				masterKey: 'secret',
			}),
		).toThrow(new TypeError('Unknown request context option: masterKey'))
		expect(() =>
			RequestContext.anonymous({
				// @ts-expect-error -- Runtime validation rejects forged cancellation values.
				signal: {},
				requestId: 'request-1',
				source: requestSources.rest,
			}),
		).toThrow(new TypeError('Request context signal must be an AbortSignal'))
		expect(() =>
			RequestContext.anonymous({
				// @ts-expect-error -- Runtime validation rejects non-record metadata.
				metadata: [],
				requestId: 'request-1',
				source: requestSources.rest,
			}),
		).toThrow(new TypeError('Request context metadata must be a plain object'))
		expect(() =>
			RequestContext.anonymous({
				// @ts-expect-error -- Runtime validation rejects non-array capabilities.
				capabilities: {},
				requestId: 'request-1',
				source: requestSources.rest,
			}),
		).toThrow(new TypeError('Request context capabilities must be an array'))
		expect(() =>
			RequestContext.anonymous({
				metadata: {
					master_key: 'secret',
				},
				requestId: 'request-1',
				source: requestSources.rest,
			}),
		).toThrow(
			new TypeError('Request context metadata cannot contain a master key'),
		)
		expect(() =>
			RequestContext.anonymous({
				metadata: {
					// @ts-expect-error -- Session credentials belong to auth plugins.
					sessionToken: 'secret',
				},
				requestId: 'request-1',
				source: requestSources.rest,
			}),
		).toThrow(
			new TypeError(
				'Request context metadata cannot contain credential field: sessionToken',
			),
		)
		expect(() =>
			RequestContext.anonymous({
				capabilities: [
					// @ts-expect-error -- Runtime validation rejects structural forgeries.
					{ name: 'tenant:read' },
				],
				requestId: 'request-1',
				source: requestSources.rest,
			}),
		).toThrow(
			new TypeError(
				'Request context capabilities[0] must be a RequestCapability',
			),
		)
		const anonymous = RequestContext.anonymous({
			requestId: 'request-master',
			source: requestSources.internal,
		})

		expect(() =>
			createTrustedMasterRequestContext('', 'maintenance', anonymous),
		).toThrow(new TypeError('Master access reason must be a non-empty string'))
		expect(() =>
			createTrustedMasterRequestContext('repair tenant data', '', anonymous),
		).toThrow(new TypeError('Master access keyId must be a non-empty string'))
	})
})
