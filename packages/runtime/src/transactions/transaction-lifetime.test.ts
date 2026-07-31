import { FrameworkError } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { TransactionLifetime } from './transaction-lifetime.js'

describe('TransactionLifetime', () => {
	it('records synchronous operation failures and closes permanently', async () => {
		const lifetime = new TransactionLifetime()
		const operationError = new Error('synchronous operation failure')

		expect(() =>
			lifetime.run(() => {
				throw operationError
			}),
		).toThrow(operationError)
		await expect(lifetime.close()).rejects.toBe(operationError)
		expect(() => {
			lifetime.assertActive()
		}).toThrow(FrameworkError)
		expect(() => lifetime.run(() => Promise.resolve('late'))).toThrow(
			FrameworkError,
		)
	})

	it('retains the first failure observed across concurrent operations', async () => {
		const lifetime = new TransactionLifetime()
		const firstError = new Error('first failure')
		const secondError = new Error('second failure')
		const firstOperation = lifetime.run(() => Promise.reject(firstError))
		const secondOperation = lifetime.run(() => Promise.reject(secondError))

		await expect(firstOperation).rejects.toBe(firstError)
		await expect(secondOperation).rejects.toBe(secondError)
		await expect(lifetime.close()).rejects.toBe(firstError)
	})
})
