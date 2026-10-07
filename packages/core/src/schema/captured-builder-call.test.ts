import { describe, expect, it } from 'vitest'

import { createCapturedBuilderCallRegistry } from './captured-builder-call.js'

describe('captured builder calls', () => {
	it('keeps immutable calls nominal to one builder family', () => {
		const [captureField, isFieldCall] =
			createCapturedBuilderCallRegistry<object>()
		const [, isOutputCall] = createCapturedBuilderCallRegistry<object>()
		const options = { required: true }
		const call = captureField('string', options)

		expect(call).toStrictEqual({ methodName: 'string', options })
		expect(Object.isFrozen(call)).toBe(true)
		expect(isFieldCall(call)).toBe(true)
		expect(isOutputCall(call)).toBe(false)
		expect(isFieldCall({ methodName: 'string', options })).toBe(false)
	})
})
