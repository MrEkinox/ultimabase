import { afterEach, describe, expect, it, vi } from 'vitest'

import { defaultGraphqlExecutionLimits } from './connection-limits.js'
import { GraphqlConnectionRuntime } from './connection-runtime.js'
import {
	graphqlCursorSecretVariable,
	resolveGraphqlCursorKey,
} from './cursor-secret.js'
import { UltimaBase } from '@ultimabase/core'

const secret = 'a-stable-secret-of-at-least-32-chars'

const Record = UltimaBase.Schema.define({
	className: 'GraphqlCursorSecretRecord',
	fields: (field) => ({ rank: field.int() }),
	graphql: true,
})

const scope = {
	relationPath: [] as const,
	typeName: 'GraphqlCursorSecretRecord',
}

const issueCursor = (runtime: GraphqlConnectionRuntime): string => {
	const prepared = runtime.prepare({
		arguments: { first: 1 },
		schema: Record,
		...scope,
	})
	const cursor = runtime.page(prepared.page, ['a']).pageInfo.endCursor
	if (cursor === null) throw new TypeError('Expected a cursor')
	return cursor
}

describe('GraphQL cursor secret', () => {
	afterEach(() => {
		vi.unstubAllEnvs()
	})

	it('derives one stable 32-byte key from the option or the environment', () => {
		const fromOption = resolveGraphqlCursorKey(secret)
		vi.stubEnv(graphqlCursorSecretVariable, secret)
		const fromEnvironment = resolveGraphqlCursorKey(undefined)

		expect(fromOption?.byteLength).toBe(32)
		expect(fromEnvironment).toStrictEqual(fromOption)
	})

	// Regression: a random per-process key invalidated every cursor after a
	// restart and between instances.
	it('keeps cursors valid across runtimes that share the secret', () => {
		const before = new GraphqlConnectionRuntime(
			defaultGraphqlExecutionLimits,
			resolveGraphqlCursorKey(secret),
		)
		const afterRestart = new GraphqlConnectionRuntime(
			defaultGraphqlExecutionLimits,
			resolveGraphqlCursorKey(secret),
		)
		const cursor = issueCursor(before)

		expect(
			afterRestart.prepare({
				arguments: { after: cursor, first: 1 },
				schema: Record,
				...scope,
			}).clauses.offset,
		).toBe(1)
		before.dispose()
		afterRestart.dispose()
	})

	it('uses a random key in development and refuses to start in production', () => {
		expect(resolveGraphqlCursorKey(undefined)).toBeUndefined()
		vi.stubEnv('NODE_ENV', 'production')
		expect(() => resolveGraphqlCursorKey(undefined)).toThrow(
			'GraphQL cursorSecret is required in production',
		)
		expect(resolveGraphqlCursorKey(secret)?.byteLength).toBe(32)
	})

	it.each([[42], ['too-short']])('rejects the invalid secret %s', (value) => {
		expect(() => resolveGraphqlCursorKey(value)).toThrow(
			'GraphQL cursorSecret must be a string of at least 32 characters',
		)
	})
})
