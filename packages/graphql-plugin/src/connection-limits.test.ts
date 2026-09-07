import { describe, expect, it } from 'vitest'

import {
	defaultGraphqlExecutionLimits,
	normalizeGraphqlExecutionLimits,
} from './connection-limits.js'

describe('GraphQL connection limits', () => {
	it('applies immutable defaults and accepts bounded overrides', () => {
		expect(normalizeGraphqlExecutionLimits({})).toStrictEqual(
			defaultGraphqlExecutionLimits,
		)
		expect(
			normalizeGraphqlExecutionLimits({
				defaultPageSize: 0,
				maxPageSize: 20,
			}),
		).toStrictEqual({ defaultPageSize: 0, maxPageSize: 20 })
		expect(Object.isFrozen(defaultGraphqlExecutionLimits)).toBe(true)
	})

	it.each([
		[null, 'plain object'],
		[{ unknown: 1 }, 'unknown option'],
		[{ defaultPageSize: -1 }, 'greater than or equal to 0'],
		[{ defaultPageSize: 2.5 }, 'safe integer'],
		[{ maxPageSize: 0 }, 'greater than or equal to 1'],
		[{ maxPageSize: 10, defaultPageSize: 11 }, 'must not exceed'],
		[{ defaultPageSize: 2_147_483_648 }, 'GraphQL Int range'],
	])('rejects malformed limits %#', (value, message) => {
		expect(() => normalizeGraphqlExecutionLimits(value)).toThrow(message)
	})
})
