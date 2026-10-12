import type { AuthUserRecord } from '@ultimabase/auth-plugin'
import { isPlainRecord, type MaybePromise } from '@ultimabase/shared'

import { resolveBoundedInteger } from './policy-options.js'

const minute = 60_000
const hour = 60 * minute
const day = 24 * hour

/** What `sendResetEmail` receives: deliver `token` to `email`. */
export interface PasswordResetMessage {
	/** The User row (personal data), read with the plugin's elevation. */
	readonly user: AuthUserRecord
	/** The address the reset was requested for. */
	readonly email: string
	/** The single-use reset token; only its SHA-256 digest is stored. */
	readonly token: string
	/** When the token stops being accepted (ISO time). */
	readonly expiresAt: string
}

/** Enables `requestPasswordReset` and `resetPassword`. */
export interface PasswordResetOptions {
	/**
	 * Delivers a reset token, after the request commits and outside it: a
	 * failure is logged and never reaches the client. UltimaBase sends no email.
	 * @example `sendResetEmail: ({ email, token }) => mailer.send(email, resetLink(token))`
	 */
	readonly sendResetEmail: (message: PasswordResetMessage) => MaybePromise<void>
	/**
	 * How long a reset token is accepted, from five minutes to one day.
	 * @default 3600000
	 */
	readonly expiresInMs?: number
}

/** What `sendVerificationEmail` receives: deliver `token` to `email`. */
export interface EmailVerificationMessage {
	/** The User row (personal data), read with the plugin's elevation. */
	readonly user: AuthUserRecord
	/** The address to verify. */
	readonly email: string
	/** The single-use verification token; only its SHA-256 digest is stored. */
	readonly token: string
	/** When the token stops being accepted (ISO time). */
	readonly expiresAt: string
}

/** Enables `requestEmailVerification`, `verifyEmail` and sign-up verification. */
export interface PasswordVerificationOptions {
	/**
	 * Delivers a verification token after sign-up or `requestEmailVerification`,
	 * after commit and outside the request. UltimaBase sends no email.
	 * @example `sendVerificationEmail: ({ email, token }) => mailer.send(email, verifyLink(token))`
	 */
	readonly sendVerificationEmail: (
		message: EmailVerificationMessage,
	) => MaybePromise<void>
	/**
	 * Refuses `login` with `AUTH_EMAIL_NOT_VERIFIED` until the email is
	 * verified; sign-up still returns its first session.
	 * @default false
	 */
	readonly requireVerifiedEmail?: boolean
	/**
	 * How long a verification token is accepted, from five minutes to seven days.
	 * @default 86400000
	 */
	readonly expiresInMs?: number
}

/** What `sendConfirmationEmail` receives: deliver `token` to the new `email`. */
export interface EmailChangeConfirmationMessage {
	/** The User row (personal data), read with the plugin's elevation. */
	readonly user: AuthUserRecord
	/** The requested new address, which receives the token. */
	readonly email: string
	/** The current address. */
	readonly previousEmail: string
	/** The single-use confirmation token; only its SHA-256 digest is stored. */
	readonly token: string
	/** When the token stops being accepted (ISO time). */
	readonly expiresAt: string
}

/** What `sendNoticeEmail` receives: tell the previous `email` it was replaced. */
export interface EmailChangeNoticeMessage {
	/** The User row after the change (personal data). */
	readonly user: AuthUserRecord
	/** The replaced address, which receives the notice. */
	readonly email: string
	/** The new address. */
	readonly newEmail: string
}

/** Enables `requestEmailChange` and `confirmEmailChange`. */
export interface PasswordEmailChangeOptions {
	/**
	 * Delivers the confirmation token to the requested address, after commit.
	 * @example `sendConfirmationEmail: ({ email, token }) => mailer.send(email, confirmLink(token))`
	 */
	readonly sendConfirmationEmail: (
		message: EmailChangeConfirmationMessage,
	) => MaybePromise<void>
	/**
	 * Notifies the replaced address once the change is confirmed, after commit.
	 * @example `sendNoticeEmail: ({ email, newEmail }) => mailer.send(email, notice(newEmail))`
	 */
	readonly sendNoticeEmail: (
		message: EmailChangeNoticeMessage,
	) => MaybePromise<void>
	/**
	 * How long a confirmation token is accepted, from five minutes to one day.
	 * @default 3600000
	 */
	readonly expiresInMs?: number
}

/** One validated application callback; its result is awaited after commit. */
type Deliver<TMessage> = (message: TMessage) => unknown

/** The validated email flows of one password method. */
export interface ResolvedPasswordEmailOptions {
	readonly emailChange:
		| Readonly<{
				expiresInMs: number
				sendConfirmationEmail: Deliver<EmailChangeConfirmationMessage>
				sendNoticeEmail: Deliver<EmailChangeNoticeMessage>
		  }>
		| undefined
	readonly reset:
		| Readonly<{
				expiresInMs: number
				sendResetEmail: Deliver<PasswordResetMessage>
		  }>
		| undefined
	readonly verification:
		| Readonly<{
				expiresInMs: number
				requireVerifiedEmail: boolean
				sendVerificationEmail: Deliver<EmailVerificationMessage>
		  }>
		| undefined
}

const readGroup = (
	value: unknown,
	path: string,
	keys: readonly string[],
	callbacks: readonly string[],
): Readonly<Record<string, unknown>> | undefined => {
	if (value === undefined) return undefined
	if (!isPlainRecord(value)) {
		throw new TypeError(`password ${path} must be a plain object`)
	}
	const unknownKey = Object.keys(value).find((key) => !keys.includes(key))
	if (unknownKey !== undefined) {
		throw new TypeError(
			`password ${path} contains unknown option: ${unknownKey}`,
		)
	}
	for (const name of callbacks) {
		if (typeof value[name] !== 'function') {
			throw new TypeError(`password ${path}.${name} must be a function`)
		}
	}
	return value
}

const isCallback = (value: unknown): value is (message: unknown) => unknown =>
	typeof value === 'function'

/** Captures one callback the group was checked to contain. */
const callback = <TMessage>(
	group: Readonly<Record<string, unknown>>,
	name: string,
): Deliver<TMessage> => {
	const value = group[name]
	if (!isCallback(value)) {
		throw new TypeError(`password callback ${name} must be a function`)
	}
	return (message) => value(message)
}

/** Validates the `reset`, `verification` and `emailChange` groups. */
export const resolvePasswordEmailOptions = (
	options: Readonly<{
		emailChange?: unknown
		identifier: 'email' | 'username'
		reset?: unknown
		verification?: unknown
	}>,
): ResolvedPasswordEmailOptions => {
	const reset = readGroup(
		options.reset,
		'reset',
		['expiresInMs', 'sendResetEmail'],
		['sendResetEmail'],
	)
	const verification = readGroup(
		options.verification,
		'verification',
		['expiresInMs', 'requireVerifiedEmail', 'sendVerificationEmail'],
		['sendVerificationEmail'],
	)
	const emailChange = readGroup(
		options.emailChange,
		'emailChange',
		['expiresInMs', 'sendConfirmationEmail', 'sendNoticeEmail'],
		['sendConfirmationEmail', 'sendNoticeEmail'],
	)
	if (
		options.identifier !== 'email' &&
		(reset !== undefined ||
			verification !== undefined ||
			emailChange !== undefined)
	) {
		throw new TypeError(
			"password reset, verification and emailChange require identifier: 'email'",
		)
	}
	const requireVerifiedEmail = verification?.requireVerifiedEmail ?? false
	if (typeof requireVerifiedEmail !== 'boolean') {
		throw new TypeError(
			'password verification.requireVerifiedEmail must be a boolean',
		)
	}
	return {
		emailChange:
			emailChange === undefined
				? undefined
				: {
						expiresInMs: resolveBoundedInteger(
							emailChange.expiresInMs,
							hour,
							5 * minute,
							day,
							'password emailChange.expiresInMs',
						),
						sendConfirmationEmail: callback(
							emailChange,
							'sendConfirmationEmail',
						),
						sendNoticeEmail: callback(emailChange, 'sendNoticeEmail'),
					},
		reset:
			reset === undefined
				? undefined
				: {
						expiresInMs: resolveBoundedInteger(
							reset.expiresInMs,
							hour,
							5 * minute,
							day,
							'password reset.expiresInMs',
						),
						sendResetEmail: callback(reset, 'sendResetEmail'),
					},
		verification:
			verification === undefined
				? undefined
				: {
						expiresInMs: resolveBoundedInteger(
							verification.expiresInMs,
							day,
							5 * minute,
							7 * day,
							'password verification.expiresInMs',
						),
						requireVerifiedEmail,
						sendVerificationEmail: callback(
							verification,
							'sendVerificationEmail',
						),
					},
	}
}
