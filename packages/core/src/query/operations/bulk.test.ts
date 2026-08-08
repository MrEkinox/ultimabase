import { describe, expect, it } from 'vitest'

import { snapshotCreateInputs } from './bulk.js'

describe('bulk operation normalization', () => {
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
