import { describe, expect, it } from 'vitest'

import { snapshotCapturedFieldOptions } from './captured-options.js'

describe('captured field options', () => {
	it('detaches plain data while retaining callback-bearing option identity', () => {
		const plain = { nested: { enabled: true } }
		const executable = {
			protocol: {
				execute: (): void => undefined,
			},
		}
		const snapshot = snapshotCapturedFieldOptions({ executable, plain })

		expect(snapshot).toEqual({ executable, plain })
		expect(Reflect.get(snapshot as object, 'executable')).toBe(executable)
		expect(Reflect.get(snapshot as object, 'plain')).not.toBe(plain)
		expect(Object.isFrozen(snapshot)).toBe(true)
	})
})
