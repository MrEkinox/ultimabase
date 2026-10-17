import { PluginError } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import {
	authErrorCodes,
	authErrorStatuses,
	rejectCredentials,
	rejectNotConfigured,
	rejectSession,
	rejectSignUp,
	rejectToken,
	rejectUnreadableUser,
	rejectUnverifiedEmail,
} from './errors.js'

const failureOf = (reject: () => never): unknown => {
	try {
		return reject()
	} catch (error: unknown) {
		expect(error).toBeInstanceOf(PluginError)
		return error
	}
}

describe('authentication failures', () => {
	it('gives every public code one HTTP status', () => {
		expect(Object.keys(authErrorStatuses).sort()).toStrictEqual(
			Object.values(authErrorCodes).sort(),
		)
		expect(authErrorStatuses).toMatchObject({
			AUTH_INVALID_CREDENTIALS: 401,
			AUTH_INVALID_SESSION: 401,
			AUTH_NOT_CONFIGURED: 501,
			AUTH_TOO_MANY_ATTEMPTS: 429,
			AUTH_USER_NOT_READABLE: 500,
		})
	})

	it('rejects credentials, sessions and tokens uniformly, without detail', () => {
		for (const [reject, code, publicMessage] of [
			[rejectCredentials, 'AUTH_INVALID_CREDENTIALS', 'Invalid credentials.'],
			[rejectSession, 'AUTH_INVALID_SESSION', 'Invalid session.'],
			[rejectToken, 'AUTH_INVALID_TOKEN', 'Invalid or expired token.'],
			[
				rejectUnverifiedEmail,
				'AUTH_EMAIL_NOT_VERIFIED',
				'Verify your email address first.',
			],
		] as const) {
			const failure = failureOf(reject)
			expect(failure).toMatchObject({ code, publicMessage })
			expect(failure).toHaveProperty('publicDetails', undefined)
			expect(failure).toHaveProperty('cause', undefined)
		}
	})

	it('names the unconfigured feature only in the internal message', () => {
		const failure = failureOf(() => rejectNotConfigured('Password reset'))
		expect(failure).toMatchObject({
			code: 'AUTH_NOT_CONFIGURED',
			message: 'Password reset has no email callback configured.',
			publicMessage: 'This operation is not available.',
		})
	})

	it('names invalid sign-up fields and keeps the replaced failure', () => {
		const cause = new Error('VALIDATION_ERROR')
		expect(failureOf(() => rejectSignUp(['name', 'age'], cause))).toMatchObject(
			{
				cause,
				publicDetails: { fields: ['name', 'age'] },
				publicMessage: 'Sign-up was rejected: check name, age.',
			},
		)
		expect(failureOf(() => rejectSignUp())).toMatchObject({
			publicDetails: undefined,
			publicMessage: 'Sign-up was rejected.',
		})
	})

	it('tells the server which read rule an unreadable User needs, and clients nothing', () => {
		const cause = new Error('PERMISSION_DENIED')
		const failure = failureOf(() => rejectUnreadableUser('TodoUser', cause))
		expect(failure).toMatchObject({
			cause,
			code: 'AUTH_USER_NOT_READABLE',
			publicMessage:
				'The authentication request could not be completed: the server configuration is invalid.',
		})
		expect(String(Reflect.get(Object(failure), 'message'))).toContain(
			'TodoUser.with({ access: { read: isSelf } })',
		)
		expect(String(Reflect.get(Object(failure), 'publicMessage'))).not.toContain(
			'TodoUser',
		)
	})
})
