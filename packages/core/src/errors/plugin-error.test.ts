import { describe, expect, it } from 'vitest'

import { FrameworkError, PluginError } from '../index.js'

describe('PluginError', () => {
	it('serializes only explicitly public plugin-owned details', () => {
		const cause = new Error('database secret')
		const publicDetails = { retryAfter: 30 }
		const internalDetails = { processor: 'secret' }
		const error = new PluginError(
			'community.billing.card-declined',
			'Processor diagnostic',
			{
				cause,
				internalDetails,
				publicDetails,
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
		expect(error.publicDetails).not.toBe(publicDetails)
		expect(error.internalDetails).not.toBe(internalDetails)
		expect(Object.isFrozen(error.publicDetails)).toBe(true)
		expect(Object.isFrozen(error.internalDetails)).toBe(true)
		expect(error.toJSON()).toStrictEqual({
			code: 'community.billing.card-declined',
			details: { retryAfter: 30 },
			message: 'The card was declined.',
			retryable: true,
		})
		expect(JSON.stringify(error)).not.toContain('secret')
		expect(Object.isFrozen(error)).toBe(true)
	})

	it('retains a distinct native error identity', () => {
		const pluginError = new PluginError('DECLINED', 'Declined')
		const frameworkError = new FrameworkError('NOT_FOUND', 'Missing')

		expect(pluginError).toBeInstanceOf(Error)
		expect(pluginError).toBeInstanceOf(PluginError)
		expect(pluginError).not.toBeInstanceOf(FrameworkError)
		expect(frameworkError).not.toBeInstanceOf(PluginError)
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
		expect(
			() => new PluginError('DECLINED', 'Declined', null as never),
		).toThrow('Plugin error options must be a plain object')
		expect(
			() =>
				new PluginError('DECLINED', 'Declined', {
					retryable: 'yes' as never,
				}),
		).toThrow('retryable must be a boolean')
		expect(
			() =>
				new PluginError('DECLINED', 'Declined', {
					internalDetails: null as never,
				}),
		).toThrow('internalDetails must be a plain object')
	})
})
