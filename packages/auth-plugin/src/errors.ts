import { PluginError, type FrameworkErrorDetails } from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

/** Lists the public failures of the authentication foundation and its methods. */
export const authErrorCodes: Readonly<{
	readonly invalidCredentials: 'AUTH_INVALID_CREDENTIALS'
	readonly invalidSession: 'AUTH_INVALID_SESSION'
	readonly lastMethod: 'AUTH_LAST_METHOD'
	readonly notFound: 'AUTH_NOT_FOUND'
	readonly reauthenticationRequired: 'AUTH_REAUTHENTICATION_REQUIRED'
	readonly signUpRejected: 'AUTH_SIGN_UP_REJECTED'
	readonly tooManyAttempts: 'AUTH_TOO_MANY_ATTEMPTS'
}> = immutableRecord({
	invalidCredentials: 'AUTH_INVALID_CREDENTIALS',
	invalidSession: 'AUTH_INVALID_SESSION',
	lastMethod: 'AUTH_LAST_METHOD',
	notFound: 'AUTH_NOT_FOUND',
	reauthenticationRequired: 'AUTH_REAUTHENTICATION_REQUIRED',
	signUpRejected: 'AUTH_SIGN_UP_REJECTED',
	tooManyAttempts: 'AUTH_TOO_MANY_ATTEMPTS',
} as const)

/** One public failure code of the foundation. */
export type AuthErrorCode = (typeof authErrorCodes)[keyof typeof authErrorCodes]

/** The HTTP status of each foundation failure, shared by every transport. */
export const authErrorStatuses: Readonly<Record<AuthErrorCode, number>> =
	immutableRecord({
		AUTH_INVALID_CREDENTIALS: 401,
		AUTH_INVALID_SESSION: 401,
		AUTH_LAST_METHOD: 409,
		AUTH_NOT_FOUND: 404,
		AUTH_REAUTHENTICATION_REQUIRED: 403,
		AUTH_SIGN_UP_REJECTED: 400,
		AUTH_TOO_MANY_ATTEMPTS: 429,
	})

const reject = (
	code: AuthErrorCode,
	message: string,
	publicMessage: string,
	publicDetails?: FrameworkErrorDetails,
): never => {
	throw new PluginError(code, message, {
		publicMessage,
		...(publicDetails === undefined ? {} : { publicDetails }),
	})
}

/** The enumeration-safe rejection of every credential failure. */
export const rejectCredentials = (): never =>
	reject(
		authErrorCodes.invalidCredentials,
		'Authentication credentials were rejected.',
		'Invalid credentials.',
	)

/** The uniform rejection of an invalid, expired, revoked or stale session. */
export const rejectSession = (): never =>
	reject(
		authErrorCodes.invalidSession,
		'Authentication session was rejected.',
		'Invalid session.',
	)

/** Rejects a sign-up; `fields` names the fields the input is missing or invalid. */
export const rejectSignUp = (fields: readonly string[] = []): never =>
	reject(
		authErrorCodes.signUpRejected,
		'Authentication sign-up was rejected.',
		fields.length === 0
			? 'Sign-up was rejected.'
			: `Sign-up was rejected: check ${fields.join(', ')}.`,
		fields.length === 0 ? undefined : { fields: [...fields] },
	)

/** Rejects an attempt until the limit expires. */
export const rejectTooManyAttempts = (retryAfterSeconds: number): never =>
	reject(
		authErrorCodes.tooManyAttempts,
		'Authentication attempts are limited.',
		'Too many attempts; retry later.',
		{ retryAfterSeconds },
	)

/** Requires a recent login or `reauthenticate` before a sensitive operation. */
export const rejectReauthentication = (): never =>
	reject(
		authErrorCodes.reauthenticationRequired,
		'Authentication is not recent enough.',
		'Recent authentication is required.',
	)

/** Refuses to remove the last authentication method of a user. */
export const rejectLastMethod = (): never =>
	reject(
		authErrorCodes.lastMethod,
		'The last authentication method cannot be removed.',
		'The last sign-in method cannot be removed.',
	)

/** Rejects an unknown session or method id, or one owned by another user. */
export const rejectNotFound = (): never =>
	reject(
		authErrorCodes.notFound,
		'The authentication record was not found.',
		'Not found.',
	)
