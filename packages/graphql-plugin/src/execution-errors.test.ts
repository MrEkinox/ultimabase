import { FrameworkError, PluginError } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { GraphqlInvalidCursorError } from './connection-errors.js'
import { createSafeGraphqlError } from './execution-errors.js'

describe('GraphQL execution errors', () => {
	it('preserves only explicitly public Core metadata', () => {
		const error = createSafeGraphqlError(
			new FrameworkError('PERMISSION_DENIED', 'private policy trace', {
				internalDetails: { policy: 'secret-policy' },
				publicDetails: { field: 'title' },
				publicMessage: 'The operation is not permitted.',
				retryable: true,
			}),
			'graphql-safe-error',
		)

		expect(error.toJSON()).toMatchObject({
			extensions: {
				code: 'PERMISSION_DENIED',
				details: { field: 'title' },
				requestId: 'graphql-safe-error',
				retryable: true,
			},
			message: 'The operation is not permitted.',
		})
		expect(JSON.stringify(error)).not.toMatch(/secret-policy|private policy/u)
	})

	it('maps cursor failures and masks unknown or non-public diagnostics', () => {
		const cursor = createSafeGraphqlError(
			new GraphqlInvalidCursorError(),
			'cursor-request',
		)
		expect(cursor.toJSON()).toMatchObject({
			extensions: {
				code: 'GRAPHQL_INVALID_CURSOR',
				requestId: 'cursor-request',
				retryable: false,
			},
			message: 'Invalid GraphQL cursor.',
		})

		for (const diagnostic of [
			new Error('SQL password super-secret'),
			new PluginError('fixture.private', 'private plugin trace'),
		]) {
			const masked = createSafeGraphqlError(diagnostic, 'masked-request')
			expect(masked.toJSON()).toMatchObject({
				extensions: {
					code: 'INTERNAL_SERVER_ERROR',
					requestId: 'masked-request',
					retryable: false,
				},
				message: 'Unexpected error.',
			})
			expect(JSON.stringify(masked)).not.toMatch(
				/SQL|password|super-secret|trace/u,
			)
		}
	})
})
