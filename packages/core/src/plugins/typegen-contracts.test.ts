import { describe, expect, it } from 'vitest'

import {
	defineTypegenReference,
	isTypegenReference,
} from './typegen-contracts.js'

const reference = defineTypegenReference({
	exportName: 'WorkflowState',
	module: '@fixture/workflow',
})

describe('nominal Typegen references', () => {
	it('creates frozen nominal references without executable state', () => {
		expect(isTypegenReference(reference)).toBe(true)
		expect(isTypegenReference({ ...reference })).toBe(false)
		expect(Object.isFrozen(reference)).toBe(true)
	})
	it('rejects malformed reference descriptions', () => {
		expect(() =>
			defineTypegenReference(
				null as unknown as { readonly exportName: 'X'; readonly module: 'x' },
			),
		).toThrow('plain object')
		expect(() =>
			defineTypegenReference({ exportName: 'Invalid-Name', module: 'x' }),
		).toThrow('must be an identifier')
		expect(() =>
			defineTypegenReference({ exportName: 'X', module: ' bad module ' }),
		).toThrow('stable specifier')
		expect(() =>
			defineTypegenReference({
				exportName: 'X',
				module: 'x',
				extra: true,
			} as unknown as {
				readonly exportName: 'X'
				readonly module: 'x'
			}),
		).toThrow('unknown option')
	})
})
