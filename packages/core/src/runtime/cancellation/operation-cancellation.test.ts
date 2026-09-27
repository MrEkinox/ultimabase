import { describe, expect, it } from 'vitest'

import { FrameworkError, throwIfOperationCancelled } from '../../index.js'

const captureCancellation = (
	signal: AbortSignal,
	internalDetails?: Readonly<Record<string, unknown>>,
): unknown => {
	try {
		throwIfOperationCancelled(signal, internalDetails)
	} catch (error: unknown) {
		if (error instanceof FrameworkError) return error
		throw error
	}
	throw new TypeError('Expected operation cancellation')
}

describe('throwIfOperationCancelled', () => {
	it('returns normally while the signal remains active', () => {
		const controller = new AbortController()

		expect(() => {
			throwIfOperationCancelled(controller.signal)
		}).not.toThrow()
	})

	it('normalizes request cancellation without exposing its reason', () => {
		const controller = new AbortController()
		controller.abort('private cancellation reason')

		const error = captureCancellation(controller.signal, {
			phase: 'plugin-callback',
			reason: 'caller-value',
		})

		expect(error).toMatchObject({
			code: 'OPERATION_CANCELLED',
			message: 'Operation execution was cancelled.',
			publicMessage: 'The operation was cancelled.',
			internalDetails: {
				phase: 'plugin-callback',
				reason: 'request-aborted',
			},
		})
		expect(JSON.stringify(error)).not.toContain('private cancellation reason')
	})

	it('normalizes timeout-shaped errors without copying their message', () => {
		const controller = new AbortController()
		const timeout = new Error('private timeout message')
		timeout.name = 'TimeoutError'
		controller.abort(timeout)

		const error = captureCancellation(controller.signal)

		expect(error).toMatchObject({
			internalDetails: { reason: 'deadline-exceeded' },
		})
		expect(JSON.stringify(error)).not.toContain('private timeout message')
	})
})
