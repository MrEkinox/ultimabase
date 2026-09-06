import { describe, expect, it } from 'vitest'

import { PluginError } from './plugin-error.js'

describe('PluginError', () => {
	it('serializes only explicitly public plugin-owned details', () => {
		const cause = new Error('database secret')
		const error = new PluginError(
			'community.billing.card-declined',
			'Processor diagnostic',
			{
				cause,
				internalDetails: { processor: 'secret' },
				publicDetails: { retryAfter: 30 },
				publicMessage: 'The card was declined.',
				retryable: true,
			},
		)

		expect(error).toMatchObject({
			cause,
			code: 'community.billing.card-declined',
			internalDetails: { processor: 'secret' },
			name: 'PluginError',
			retryable: true,
		})
		expect(error.toJSON()).toStrictEqual({
			code: 'community.billing.card-declined',
			details: { retryAfter: 30 },
			message: 'The card was declined.',
			retryable: true,
		})
		expect(JSON.stringify(error)).not.toContain('secret')
		expect(Object.isFrozen(error)).toBe(true)
	})

	it('accepts constant codes and rejects malformed public metadata', () => {
		expect(new PluginError('DECLINED', 'Declined').code).toBe('DECLINED')
		expect(() => new PluginError('not-namespaced', 'Declined')).toThrow(
			'plugin error code must be namespaced or a constant identifier',
		)
		expect(
			() =>
				new PluginError('community.billing.declined', 'Declined', {
					publicDetails: [] as never,
				}),
		).toThrow('publicDetails must be a plain object')
	})
})
