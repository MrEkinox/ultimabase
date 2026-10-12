import { authErrorCodes } from '@ultimabase/auth-plugin'
import { immutableRecord } from '@ultimabase/shared'

import {
	acknowledgement,
	exactStrings,
	passwordErrorCodes,
	passwordOperation,
	type PasswordOperation,
} from './operations.js'

/** Requests a reset or verification email for one address. */
export interface PasswordEmailInput {
	readonly email: string
}

/** Redeems one single-use token: email verification or email change. */
export interface PasswordTokenInput {
	readonly token: string
}

/** Sets a new password with a reset token. */
export interface PasswordResetInput {
	readonly newPassword: string
	readonly token: string
}

/** Requests a change of the authenticated user's email. */
export interface EmailChangeRequestInput {
	readonly currentPassword: string
	readonly newEmail: string
}

/**
 * Acknowledges a request. Reset and verification requests answer the same
 * whether an account exists or not.
 */
export interface PasswordRequestAcceptedResult {
	readonly accepted: true
}

/** Acknowledges a password reset: every session of the user was revoked. */
export interface PasswordResetResult {
	readonly reset: true
}

/** Acknowledges a verified email. */
export interface EmailVerifyResult {
	readonly verified: true
}

/** Acknowledges a confirmed email change. */
export interface EmailChangeConfirmResult {
	readonly confirmed: true
}

const emailInput = exactStrings<PasswordEmailInput>(
	['email'])
const tokenInput = exactStrings<PasswordTokenInput>(
	['token'])
const accepted = acknowledgement<PasswordRequestAcceptedResult>(
	'accepted')

const requestPasswordResetOperation: PasswordOperation<
	'request-password-reset',
	PasswordEmailInput,
	PasswordRequestAcceptedResult,
	readonly ['AUTH_NOT_CONFIGURED', 'AUTH_TOO_MANY_ATTEMPTS']
> = passwordOperation('request-password-reset', emailInput, accepted, [
	authErrorCodes.notConfigured,
	authErrorCodes.tooManyAttempts,
])
const resetPasswordOperation: PasswordOperation<
	'reset-password',
	PasswordResetInput,
	PasswordResetResult,
	readonly [
		'AUTH_INVALID_TOKEN',
		'AUTH_PASSWORD_CHANGE_REJECTED',
		'AUTH_TOO_MANY_ATTEMPTS',
	]
> = passwordOperation(
	'reset-password',
	exactStrings<PasswordResetInput>(
		['newPassword', 'token']),
	acknowledgement<PasswordResetResult>('reset'),
	[
		authErrorCodes.invalidToken,
		passwordErrorCodes.passwordChangeRejected,
		authErrorCodes.tooManyAttempts,
	],
)
const requestEmailVerificationOperation: PasswordOperation<
	'request-email-verification',
	PasswordEmailInput,
	PasswordRequestAcceptedResult,
	readonly ['AUTH_NOT_CONFIGURED', 'AUTH_TOO_MANY_ATTEMPTS']
> = passwordOperation('request-email-verification', emailInput, accepted, [
	authErrorCodes.notConfigured,
	authErrorCodes.tooManyAttempts,
])
const verifyEmailOperation: PasswordOperation<
	'verify-email',
	PasswordTokenInput,
	EmailVerifyResult,
	readonly ['AUTH_INVALID_TOKEN', 'AUTH_TOO_MANY_ATTEMPTS']
> = passwordOperation(
	'verify-email',
	tokenInput,
	acknowledgement<EmailVerifyResult>('verified'),
	[authErrorCodes.invalidToken, authErrorCodes.tooManyAttempts],
)
const requestEmailChangeOperation: PasswordOperation<
	'request-email-change',
	EmailChangeRequestInput,
	PasswordRequestAcceptedResult,
	readonly [
		'AUTH_EMAIL_CHANGE_REJECTED',
		'AUTH_INVALID_SESSION',
		'AUTH_NOT_CONFIGURED',
		'AUTH_TOO_MANY_ATTEMPTS',
	]
> = passwordOperation(
	'request-email-change',
	exactStrings<EmailChangeRequestInput>(
		['currentPassword', 'newEmail']),
	accepted,
	[
		passwordErrorCodes.emailChangeRejected,
		authErrorCodes.invalidSession,
		authErrorCodes.notConfigured,
		authErrorCodes.tooManyAttempts,
	],
)
const confirmEmailChangeOperation: PasswordOperation<
	'confirm-email-change',
	PasswordTokenInput,
	EmailChangeConfirmResult,
	readonly [
		'AUTH_EMAIL_CHANGE_REJECTED',
		'AUTH_INVALID_TOKEN',
		'AUTH_TOO_MANY_ATTEMPTS',
	]
> = passwordOperation(
	'confirm-email-change',
	tokenInput,
	acknowledgement<EmailChangeConfirmResult>(
		'confirmed'),
	[
		passwordErrorCodes.emailChangeRejected,
		authErrorCodes.invalidToken,
		authErrorCodes.tooManyAttempts,
	],
)

// The `typeof` members keep hovers on the named private constants.
/**
 * The email operations of `password({ identifier: 'email' })`: password
 * reset, email verification and email change, all public (ADR-0324);
 * `restPlugin({ hide: Object.values(passwordEmailOperations) })` hides them.
 */
export const passwordEmailOperations: Readonly<{
	readonly confirmEmailChange: typeof confirmEmailChangeOperation
	readonly requestEmailChange: typeof requestEmailChangeOperation
	readonly requestEmailVerification: typeof requestEmailVerificationOperation
	readonly requestPasswordReset: typeof requestPasswordResetOperation
	readonly resetPassword: typeof resetPasswordOperation
	readonly verifyEmail: typeof verifyEmailOperation
}> = immutableRecord({
	confirmEmailChange: confirmEmailChangeOperation,
	requestEmailChange: requestEmailChangeOperation,
	requestEmailVerification: requestEmailVerificationOperation,
	requestPasswordReset: requestPasswordResetOperation,
	resetPassword: resetPasswordOperation,
	verifyEmail: verifyEmailOperation,
})

/** One email operation of the password method. */
export type PasswordEmailOperationDefinition =
	(typeof passwordEmailOperations)[keyof typeof passwordEmailOperations]
