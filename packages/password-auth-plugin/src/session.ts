import { createHash, randomBytes } from 'node:crypto'

import {
	FrameworkError,
	RequestContext,
	RequestContextValue,
	type OperationOptions,
	type SchemaReference,
	type SchemaResult,
} from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import {
	createPasswordPrincipal,
	isPasswordPrincipal,
	type PasswordPrincipal,
} from './principal.js'
import type { PasswordUserReference } from './user-schema.js'

declare const passwordSessionBrand: unique symbol

// Membership marks package-created context sessions; the value is the private
// account generation each one was issued under.
const passwordSessionGenerations = new WeakMap<object, number>()
const rawTokenPattern = /^ub_s1\.[A-Za-z0-9_-]{43}$/u

/** Carries the safe, revocable session identity retained by a request context. */
export interface PasswordSession {
	readonly [passwordSessionBrand]: true
	readonly absoluteExpiresAt: string
	readonly createdAt: string
	readonly expiresAt: string
	readonly id: string
	readonly rotationVersion: number
}

/** Carries a newly issued token exactly once beside its safe public metadata. */
export interface IssuedPasswordSession {
	readonly absoluteExpiresAt: string
	readonly expiresAt: string
	readonly id: string
	readonly token: string
}

/** Carries the authenticated identity returned by sign-up, login, and refresh. */
export interface PasswordAuthenticationResult<
	TUser extends PasswordUserReference = PasswordUserReference,
> {
	readonly principal: PasswordPrincipal<TUser>
	readonly session: IssuedPasswordSession
	/** The current readable profile, required for authentication to succeed. */
	readonly user: SchemaResult<TUser>
}

/** Carries the exact successful logout acknowledgement. */
export interface PasswordLogoutResult {
	readonly revoked: true
}

/** Carries the exact successful password-change acknowledgement. */
export interface PasswordChangeResult {
	readonly changed: true
}

/** Identifies Password Auth principal state by nominal token identity. */
export const passwordPrincipal: RequestContextValue<
	PasswordPrincipal,
	'ultimabase.password-auth.principal'
> = new RequestContextValue<
	PasswordPrincipal,
	'ultimabase.password-auth.principal'
>('ultimabase.password-auth.principal', (value) => {
	if (!isPasswordPrincipal(value)) {
		throw new TypeError('Password Auth principal must be package-owned')
	}
	return value
})

/** Identifies Password Auth session state by nominal token identity. */
export const passwordSession: RequestContextValue<
	PasswordSession,
	'ultimabase.password-auth.session'
> = new RequestContextValue<
	PasswordSession,
	'ultimabase.password-auth.session'
>('ultimabase.password-auth.session', (value) => {
	if (!isPasswordSession(value)) {
		throw new TypeError('Password Auth session must be package-owned')
	}
	return value
})

/** Creates one opaque bearer token and its non-reversible storage digest. */
export const createPasswordSessionToken = (): Readonly<{
	readonly digest: string
	readonly token: string
}> => {
	const token = `ub_s1.${randomBytes(32).toString('base64url')}`
	return immutableRecord({ digest: digestPasswordSessionToken(token), token })
}

/** Produces a stable digest without retaining the raw token. */
export const digestPasswordSessionToken = (token: string): string =>
	createHash('sha256').update(token).digest('hex')

/** Rejects malformed tokens before owner-private storage access. */
export const isPasswordSessionToken = (value: unknown): value is string =>
	typeof value === 'string' && rawTokenPattern.test(value)

/** Creates one immutable package-owned context session. */
export const createPasswordSession = (
	value: Omit<PasswordSession, typeof passwordSessionBrand>,
	sessionGeneration: number,
): PasswordSession => {
	const session = immutableRecord(value) as PasswordSession
	passwordSessionGenerations.set(session, sessionGeneration)
	return session
}

/** Recognizes only package-created context session values. */
export const isPasswordSession = (value: unknown): value is PasswordSession =>
	isPlainRecord(value) && passwordSessionGenerations.has(value)

/** Reads package-private account invalidation state from one nominal session. */
export const readPasswordSessionGeneration = (
	session: PasswordSession,
): number => {
	const generation = passwordSessionGenerations.get(session)
	if (generation === undefined) {
		throw new TypeError('Password Auth session generation is unavailable')
	}
	return generation
}

/** Reads one User profile, rejecting a missing or filtered-out row uniformly. */
export const readPasswordProfile = async <
	TUser extends SchemaReference<'User'>,
>(
	user: TUser,
	userId: string,
	options?: OperationOptions,
): Promise<SchemaResult<TUser>> => {
	const profile = await user.pointer(userId).findOne(undefined, options)
	if (profile === null) {
		throw new FrameworkError(
			'NOT_FOUND',
			'Password Auth User is not readable.',
			{ publicMessage: 'The requested object was not found.' },
		)
	}
	return profile as unknown as SchemaResult<TUser>
}

/** Reads the profile in the auth transaction with only the newly issued identity. */
export const readPasswordAuthenticationResult = async (
	user: PasswordUserReference,
	userId: string,
	session: Readonly<{
		readonly context: PasswordSession
		readonly issued: IssuedPasswordSession
	}>,
	request: RequestContext,
): Promise<PasswordAuthenticationResult> => {
	const principal = createPasswordPrincipal(user.pointer(userId))
	// Never inherit signup's temporary elevation, a caller's Master grant, or a
	// different user's subjects. Operation options retain the active transaction.
	const context = RequestContext.anonymous({
		requestId: request.requestId,
		signal: request.signal,
		source: request.source,
	})
		.withValue(passwordPrincipal, principal)
		.withValue(passwordSession, session.context)
	// Authentication must not commit credentials or a session without a readable User.
	// Read errors propagate unchanged; row filtering or absence also aborts the transaction.
	const profile = await readPasswordProfile(user, userId, { context })
	return immutableRecord({
		principal,
		session: immutableRecord(session.issued),
		user: profile,
	})
}
