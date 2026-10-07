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
				maxDepth: 12,
				maxPageSize: 20,
			}),
		).toMatchObject({ defaultPageSize: 0, maxDepth: 12, maxPageSize: 20 })
		expect(defaultGraphqlExecutionLimits).toMatchObject({
			maxAliases: 100,
			maxDepth: 20,
			maxDocumentBytes: 100 * 1024,
			maxDocumentTokens: 10_000,
			maxRootFields: 20,
			maxVariablesBytes: 1024 * 1024,
		})
		expect(Object.isFrozen(defaultGraphqlExecutionLimits)).toBe(true)
	})

	it.each([
		[null, 'plain object'],
		[{ unknown: 1 }, 'unknown option'],
		[{ defaultPageSize: -1 }, 'greater than or equal to 0'],
		[{ defaultPageSize: 2.5 }, 'safe integer'],
		[{ maxPageSize: 0 }, 'greater than or equal to 1'],
		[{ maxAliases: 0 }, 'greater than or equal to 1'],
		[{ maxDocumentBytes: 1.5 }, 'safe integer'],
		[{ maxPageSize: 10, defaultPageSize: 11 }, 'must not exceed'],
		[{ defaultPageSize: 2_147_483_648 }, 'GraphQL Int range'],
	])('rejects malformed limits %#', (value, message) => {
		expect(() => normalizeGraphqlExecutionLimits(value)).toThrow(message)
	})
})
