import { describe, expect, it } from 'vitest'

import { normalizeBulkOperationOptions, snapshotCreateInputs } from './bulk.js'

describe('bulk operation normalization', () => {
	it('defaults to an immutable atomic contract and supports explicit opt-out', () => {
		const defaults = normalizeBulkOperationOptions(undefined)
		const explicitDefaults = normalizeBulkOperationOptions({})
		const disabled = normalizeBulkOperationOptions({ atomic: false })

		expect(defaults).toStrictEqual({ atomic: true })
		expect(explicitDefaults).toBe(defaults)
		expect(disabled).toStrictEqual({ atomic: false })
		expect(Object.isFrozen(defaults)).toBe(true)
		expect(Object.isFrozen(disabled)).toBe(true)
	})

	it('rejects malformed options at the public JavaScript boundary', () => {
		expect(() => normalizeBulkOperationOptions(null as never)).toThrow(
			new TypeError('bulk operation options must be an object'),
		)
		expect(() =>
			normalizeBulkOperationOptions({ atomic: 'yes' } as never),
		).toThrow(new TypeError('bulk operation atomic option must be a boolean'))
		expect(() =>
			normalizeBulkOperationOptions({ mode: 'fast' } as never),
		).toThrow(new TypeError('bulk operation options contain unknown key: mode'))
	})

	it('snapshots the caller-owned input collection without copying values', () => {
		const first = { body: 'first' }
		const inputs = [first]
		const snapshot = snapshotCreateInputs(inputs)

		inputs.push({ body: 'later' })

		expect(snapshot).toStrictEqual([first])
		expect(snapshot[0]).toBe(first)
		expect(Object.isFrozen(snapshot)).toBe(true)
		expect(() => snapshotCreateInputs({} as never)).toThrow(
			new TypeError('bulk create inputs must be an array'),
		)
	})
})
