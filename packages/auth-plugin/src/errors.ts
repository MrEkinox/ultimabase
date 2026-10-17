import { PluginError, type FrameworkErrorDetails } from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

/** Lists the public failures of the authentication foundation and its methods. */
export const authErrorCodes: Readonly<{
	readonly emailNotVerified: 'AUTH_EMAIL_NOT_VERIFIED'
	readonly invalidCredentials: 'AUTH_INVALID_CREDENTIALS'
	readonly invalidSession: 'AUTH_INVALID_SESSION'
	readonly invalidToken: 'AUTH_INVALID_TOKEN'
	readonly lastMethod: 'AUTH_LAST_METHOD'
	readonly notConfigured: 'AUTH_NOT_CONFIGURED'
	readonly notFound: 'AUTH_NOT_FOUND'
	readonly reauthenticationRequired: 'AUTH_REAUTHENTICATION_REQUIRED'
	readonly signUpRejected: 'AUTH_SIGN_UP_REJECTED'
	readonly tooManyAttempts: 'AUTH_TOO_MANY_ATTEMPTS'
	readonly userNotReadable: 'AUTH_USER_NOT_READABLE'
}> = immutableRecord({
	emailNotVerified: 'AUTH_EMAIL_NOT_VERIFIED',
	invalidCredentials: 'AUTH_INVALID_CREDENTIALS',
	invalidSession: 'AUTH_INVALID_SESSION',
	invalidToken: 'AUTH_INVALID_TOKEN',
	lastMethod: 'AUTH_LAST_METHOD',
	notConfigured: 'AUTH_NOT_CONFIGURED',
	notFound: 'AUTH_NOT_FOUND',
	reauthenticationRequired: 'AUTH_REAUTHENTICATION_REQUIRED',
	signUpRejected: 'AUTH_SIGN_UP_REJECTED',
	tooManyAttempts: 'AUTH_TOO_MANY_ATTEMPTS',
	userNotReadable: 'AUTH_USER_NOT_READABLE',
} as const)

/** One public failure code of the foundation. */
export type AuthErrorCode = (typeof authErrorCodes)[keyof typeof authErrorCodes]

/** The HTTP status of each foundation failure, shared by every transport. */
export const authErrorStatuses: Readonly<Record<AuthErrorCode, number>> =
	immutableRecord({
		AUTH_EMAIL_NOT_VERIFIED: 403,
		AUTH_INVALID_CREDENTIALS: 401,
		AUTH_INVALID_SESSION: 401,
		AUTH_INVALID_TOKEN: 400,
		AUTH_LAST_METHOD: 409,
		AUTH_NOT_CONFIGURED: 501,
		AUTH_NOT_FOUND: 404,
		AUTH_REAUTHENTICATION_REQUIRED: 403,
		AUTH_SIGN_UP_REJECTED: 400,
		AUTH_TOO_MANY_ATTEMPTS: 429,
		AUTH_USER_NOT_READABLE: 500,
	})

const reject = (
	code: AuthErrorCode,
	message: string,
	publicMessage: string,
	publicDetails?: FrameworkErrorDetails,
	cause?: unknown,
): never => {
	throw new PluginError(code, message, {
		publicMessage,
		...(publicDetails === undefined ? {} : { publicDetails }),
		// The transaction recognizes a wrapped operation failure as the same one.
		...(cause === undefined ? {} : { cause }),
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

/**
 * Rejects a sign-up; `fields` names the fields the input is missing or
 * invalid, `cause` keeps the failure it replaces.
 */
export const rejectSignUp = (
	fields: readonly string[] = [],
	cause?: unknown,
): never =>
	reject(
		authErrorCodes.signUpRejected,
		'Authentication sign-up was rejected.',
		fields.length === 0
			? 'Sign-up was rejected.'
			: `Sign-up was rejected: check ${fields.join(', ')}.`,
		fields.length === 0 ? undefined : { fields: [...fields] },
		cause,
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

/**
 * Fails an authentication whose user cannot read their own User row: a
 * configuration error the message names, while clients see a generic one.
 */
export const rejectUnreadableUser = (
	className: string,
	cause: unknown,
): never =>
	reject(
		authErrorCodes.userNotReadable,
		`The signed-in user cannot read their own ${className} row, so authentication cannot return it: give ${className} a read rule that matches it, such as ${className}.with({ access: { read: isSelf } }) with isSelf from @ultimabase/access-plugin.`,
		'The authentication request could not be completed: the server configuration is invalid.',
		undefined,
		cause,
	)

/** Rejects an unknown session or method id, or one owned by another user. */
export const rejectNotFound = (): never =>
	reject(
		authErrorCodes.notFound,
		'The authentication record was not found.',
		'Not found.',
	)

/** The uniform rejection of an unknown, expired, used or replaced token. */
export const rejectToken = (): never =>
	reject(
		authErrorCodes.invalidToken,
		'The authentication token was rejected.',
		'Invalid or expired token.',
	)

/** Refuses a login while `requireVerifiedEmail` waits for verification. */
export const rejectUnverifiedEmail = (): never =>
	reject(
		authErrorCodes.emailNotVerified,
		'The account email is not verified.',
		'Verify your email address first.',
	)

/** Refuses a flow whose application callback is not configured. */
export const rejectNotConfigured = (feature: string): never =>
	reject(
		authErrorCodes.notConfigured,
		`${feature} has no email callback configured.`,
		'This operation is not available.',
	)
