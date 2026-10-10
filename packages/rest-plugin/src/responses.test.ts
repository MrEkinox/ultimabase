import { FrameworkError, PluginError } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import {
	RestMutationNormalizationError,
	RestOperationNormalizationError,
	RestReadNormalizationError,
	restMutationErrorCodes,
	restOperationErrorCodes,
	restReadErrorCodes,
} from './errors.js'
import {
	createRestCaughtErrorResponse,
	createRestResponseFailure,
	restResponseErrorCodes,
} from './responses.js'
import type { RestPluginOperationRouteDefinition } from './routes.js'

const requestId = 'request-2310'
const noPluginStatus = (): undefined => undefined

const readError = async (response: Response) => {
	const value: unknown = await response.json()
	return value
}

describe('REST response errors', () => {
	it('maps stable normalization and static boundary failures', async () => {
		const cases = [
			[new RestReadNormalizationError(restReadErrorCodes.invalidInput), 400],
			[new RestReadNormalizationError(restReadErrorCodes.bodyTooLarge), 413],
			[
				new RestMutationNormalizationError(
					restMutationErrorCodes.unsupportedMediaType,
				),
				415,
			],
			[
				new RestOperationNormalizationError(
					restOperationErrorCodes.invalidInput,
				),
				400,
			],
		] as const

		for (const [error, status] of cases) {
			const response = createRestCaughtErrorResponse(error, requestId, {
				statusFor: noPluginStatus,
			})
			expect(response.status).toBe(status)
			expect(response.headers.get('content-type')).toBe(
				'application/json; charset=utf-8',
			)
			expect(await readError(response)).toMatchObject({
				error: { code: error.code, requestId, retryable: false },
			})
		}

		for (const [code, status] of [
			[restResponseErrorCodes.badRequest, 400],
			[restResponseErrorCodes.unsupportedVersion, 400],
			[restResponseErrorCodes.notAcceptable, 406],
			[restResponseErrorCodes.notFound, 404],
		] as const) {
			const response = createRestResponseFailure(code, requestId)
			expect(response.status).toBe(status)
			expect(await readError(response)).toMatchObject({
				error: { code, requestId, retryable: false },
			})
		}
	})

	it('retains only explicitly public Framework payloads and statuses', async () => {
		for (const [code, status] of [
			['PERMISSION_DENIED', 403],
			['MASTER_ACCESS_DENIED', 403],
			['NOT_FOUND', 404],
			['VALIDATION_ERROR', 422],
			['UNIQUE_VIOLATION', 409],
			['REFERENCE_VIOLATION', 409],
			['TRANSACTION_CONFLICT', 409],
		] as const) {
			const response = createRestCaughtErrorResponse(
				new FrameworkError(code, 'secret framework diagnostic', {
					internalDetails: { sql: 'select secret' },
					publicDetails: { field: 'title' },
					publicMessage: 'Safe public message.',
					retryable: true,
				}),
				requestId,
				{ statusFor: noPluginStatus },
			)
			expect(response.status).toBe(status)
			expect(await readError(response)).toStrictEqual({
				error: {
					code,
					details: { field: 'title' },
					message: 'Safe public message.',
					requestId,
					retryable: true,
				},
			})
		}

		const hidden = createRestCaughtErrorResponse(
			new FrameworkError('INTERNAL_ERROR', 'database password: hidden', {
				internalDetails: { stack: 'internal stack', sql: 'select password' },
			}),
			requestId,
			{ statusFor: noPluginStatus },
		)
		const hiddenBody = await readError(hidden)
		const serialized = JSON.stringify(hiddenBody)
		expect(hidden.status).toBe(500)
		expect(hiddenBody).toMatchInlineSnapshot(`
			{
			  "error": {
			    "code": "REST_INTERNAL_ERROR",
			    "message": "The REST request could not be completed.",
			    "requestId": "request-2310",
			    "retryable": false,
			  },
			}
		`)
		expect(serialized).not.toMatch(
			/database password|internal stack|select password/u,
		)
	})

	it('uses only the selected operation public error map', async () => {
		const route = {
			operation: 'fixture.responses.execute',
		} as unknown as RestPluginOperationRouteDefinition
		const error = new PluginError(
			'fixture.responses.rejected',
			'credential=private',
			{
				internalDetails: { configuration: 'hidden' },
				publicDetails: { reason: 'conflict' },
				publicMessage: 'The operation conflicted.',
				retryable: true,
			},
		)
		const mapped = createRestCaughtErrorResponse(error, requestId, {
			route,
			statusFor: (operation, code) =>
				operation === route.operation && code === error.code ? 409 : undefined,
		})
		expect(mapped.status).toBe(409)
		expect(await readError(mapped)).toStrictEqual({
			error: {
				code: error.code,
				details: { reason: 'conflict' },
				message: 'The operation conflicted.',
				requestId,
				retryable: true,
			},
		})

		const unmapped = createRestCaughtErrorResponse(error, requestId, {
			route,
			statusFor: noPluginStatus,
		})
		const unmappedBody = await readError(unmapped)
		const serialized = JSON.stringify(unmappedBody)
		expect(unmapped.status).toBe(500)
		expect(unmappedBody).toMatchInlineSnapshot(`
			{
			  "error": {
			    "code": "REST_INTERNAL_ERROR",
			    "message": "The REST request could not be completed.",
			    "requestId": "request-2310",
			    "retryable": false,
			  },
			}
		`)
		expect(serialized).not.toMatch(/credential|configuration|conflict/u)
	})

	it('sanitizes unknown failures and unrepresentable public details', async () => {
		const failures: unknown[] = [
			new Error('postgres://user:password@private'),
			new FrameworkError('VALIDATION_ERROR', 'private validator', {
				publicDetails: { invalid: 1n },
				publicMessage: 'Public validation.',
			}),
		]
		for (const failure of failures) {
			const response = createRestCaughtErrorResponse(failure, requestId, {
				statusFor: noPluginStatus,
			})
			const serialized = await response.text()
			expect(response.status).toBe(500)
			expect(serialized).toContain('REST_INTERNAL_ERROR')
			expect(serialized).not.toMatch(/postgres|password|validator|invalid/u)
		}
	})
})
