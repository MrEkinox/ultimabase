import { describe, expect, it } from 'vitest'

import {
	defaultGraphqlExecutionLimits,
	normalizeGraphqlExecutionLimits,
} from './connection-limits.js'

describe('GraphQL connection limits', () => {
	it('applies immutable defaults and accepts bounded overrides', () => {
		expect(
			normalizeGraphqlExecutionLimits({}, { defaultTake: 100, maxTake: 1000 }),
		).toStrictEqual(defaultGraphqlExecutionLimits)
		expect(
			normalizeGraphqlExecutionLimits(
				{ maxDepth: 12 },
				{ defaultTake: 5, maxTake: 20 },
			),
		).toMatchObject({ defaultTake: 5, maxDepth: 12, maxTake: 20 })
		expect(defaultGraphqlExecutionLimits).toMatchObject({
			defaultTake: 100,
			maxTake: 1000,
		})
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
		[{ maxAliases: 0 }, 'greater than or equal to 1'],
		[{ maxDocumentBytes: 1.5 }, 'safe integer'],
		[{ defaultPageSize: 10 }, 'unknown option'],
	])('rejects malformed limits %#', (value, message) => {
		expect(() =>
			normalizeGraphqlExecutionLimits(value, {
				defaultTake: 100,
				maxTake: 1000,
			}),
		).toThrow(message)
	})

	// Plugin Kit parses `pagination` (ADR-0347); GraphQL adds the Int range.
	it('rejects a default page size beyond the GraphQL Int range', () => {
		expect(() =>
			normalizeGraphqlExecutionLimits(undefined, {
				defaultTake: 2_147_483_648,
				maxTake: 2_147_483_648,
			}),
		).toThrow('GraphQL Int range')
	})
})
