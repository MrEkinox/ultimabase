import { FrameworkError, PluginError, type Logger } from '@ultimabase/core'
import { describe, expect, it, vi } from 'vitest'

import { createSafeGraphqlError } from './execution-errors.js'

const createLogger = () => ({
	debug: vi.fn<Logger['debug']>(),
	error: vi.fn<Logger['error']>(),
	info: vi.fn<Logger['info']>(),
	warn: vi.fn<Logger['warn']>(),
})

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
			createLogger(),
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

	it('masks unknown or non-public diagnostics', () => {
		for (const diagnostic of [
			new Error('SQL password super-secret'),
			new PluginError('fixture.private', 'private plugin trace'),
		]) {
			const logger = createLogger()
			const masked = createSafeGraphqlError(
				diagnostic,
				'masked-request',
				logger,
			)
			// ADR-0313: the masked failure reaches the plugin logger only.
			expect(logger.error).toHaveBeenCalledExactlyOnceWith(
				'GraphQL request masked-request failed',
				diagnostic,
			)
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
