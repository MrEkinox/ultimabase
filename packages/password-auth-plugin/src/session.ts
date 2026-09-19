import { createHash, randomBytes, randomUUID } from 'node:crypto'

import { RequestContextValue, type SchemaResult } from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import {
	createPasswordPrincipal,
	isPasswordPrincipal,
	type PasswordPrincipal,
} from './principal.js'
import type { PasswordUserDefinition } from './user-schema.js'

declare const passwordSessionBrand: unique symbol

const passwordSessions = new WeakSet<object>()
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
	TUser extends PasswordUserDefinition = PasswordUserDefinition,
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

/** Creates an RFC UUID for one stable session identity. */
export const createPasswordSessionId = (): string => randomUUID()

/** Creates one immutable package-owned context session. */
export const createPasswordSession = (
	value: Omit<PasswordSession, typeof passwordSessionBrand>,
): PasswordSession => {
	const session = immutableRecord(value) as PasswordSession
	passwordSessions.add(session)
	return session
}

/** Creates one immutable principal and session pair from validated state. */
export const createPasswordAuthenticationResult = (
	user: PasswordUserDefinition,
	userId: string,
	session: IssuedPasswordSession,
	profile: SchemaResult<PasswordUserDefinition>,
): PasswordAuthenticationResult =>
	immutableRecord({
		principal: createPasswordPrincipal(user.pointer(userId)),
		session: immutableRecord(session),
		user: profile,
	})

/** Recognizes only package-created context session values. */
export const isPasswordSession = (value: unknown): value is PasswordSession =>
	isPlainRecord(value) && passwordSessions.has(value)
