import { RequestCapability } from '@ultimabase/access'
import { describe, expect, it } from 'vitest'

import {
	createTrustedMasterRequestContext,
	RequestContext,
	requestSources,
} from './request-context.js'

describe('RequestContext', () => {
	it('creates immutable anonymous and authenticated user contexts', () => {
		const metadata = { trace: 'trace-1' }
		const capability = new RequestCapability('tenant:read')
		const capabilities: RequestCapability[] = [capability]
		const anonymous = RequestContext.anonymous({
			requestId: 'request-1',
			source: requestSources.rest,
		})
		const user = RequestContext.user('user-1', {
			capabilities,
			metadata,
			requestId: 'request-2',
			source: requestSources.graphql,
		})

		metadata.trace = 'changed'
		capabilities.push(new RequestCapability('tenant:write'))

		expect(anonymous.access).toStrictEqual({ mode: 'anonymous' })
		expect(anonymous.metadata).toStrictEqual({})
		expect(anonymous.capabilities).toStrictEqual([])
		expect(user.access).toStrictEqual({ mode: 'user', userId: 'user-1' })
		expect(user.metadata).toStrictEqual({ trace: 'trace-1' })
		expect(user.capabilities).toStrictEqual([capability])
		expect(user.hasCapability(capability)).toBe(true)
		expect(user.hasCapability(new RequestCapability('tenant:read'))).toBe(false)
		expect(Object.isFrozen(user.access)).toBe(true)
		expect(Object.isFrozen(user.metadata)).toBe(true)
		expect(Object.isFrozen(user.capabilities)).toBe(true)
		expect(Object.isFrozen(user)).toBe(true)
	})

	it('retains custom source literals without changing access semantics', () => {
		const context = RequestContext.anonymous({
			requestId: 'request-grpc',
			source: 'grpc',
		})

		expect(context.source).toBe('grpc')
		expect(context.access.mode).toBe('anonymous')
	})

	it('keeps master construction behind the internal trusted boundary', () => {
		const context = createTrustedMasterRequestContext(
			'repair tenant data',
			'maintenance',
			{
				requestId: 'request-master',
				source: requestSources.internal,
			},
		)

		expect(context.access).toStrictEqual({
			keyId: 'maintenance',
			mode: 'master',
			reason: 'repair tenant data',
		})
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
			RequestContext.user('', {
				requestId: 'request-1',
				source: requestSources.internal,
			}),
		).toThrow(
			new TypeError('Request context userId must be a non-empty string'),
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
		expect(() =>
			createTrustedMasterRequestContext('', 'maintenance', {
				requestId: 'request-master',
				source: requestSources.internal,
			}),
		).toThrow(new TypeError('Master access reason must be a non-empty string'))
		expect(() =>
			createTrustedMasterRequestContext('repair tenant data', '', {
				requestId: 'request-master',
				source: requestSources.internal,
			}),
		).toThrow(new TypeError('Master access keyId must be a non-empty string'))
	})
})
