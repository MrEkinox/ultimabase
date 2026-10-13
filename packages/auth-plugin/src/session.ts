import { createHash, randomBytes } from 'node:crypto'

import type { Model, SchemaDefinition } from '@ultimabase/core'
import { RequestContextValue } from '@ultimabase/core/plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { isAuthPrincipal, type AuthPrincipal } from './principal.js'

declare const authSessionBrand: unique symbol

// Membership marks package-created context sessions; the value is the private
// account generation each one was issued under.
const authSessionGenerations = new WeakMap<object, number>()
const rawTokenPattern = /^ub_s1\.[A-Za-z0-9_-]{43}$/u

/** The safe, revocable session identity a request context retains. */
export interface AuthSession {
	readonly [authSessionBrand]: true
	readonly absoluteExpiresAt: string
	/**
	 * When the session's user last proved a credential (login or
	 * `reauthenticate`), as read when the request began.
	 */
	readonly authenticatedAt: string
	readonly createdAt: string
	readonly expiresAt: string
	readonly id: string
	/** The method that authenticated this session, such as `password`. */
	readonly method: string
	readonly rotationVersion: number
}

/** A newly issued token, returned exactly once beside its public metadata. */
export interface IssuedAuthSession {
	readonly absoluteExpiresAt: string
	readonly expiresAt: string
	readonly id: string
	readonly token: string
}

/**
 * The result of sign-up, login and refresh: the readable profile and a new
 * session.
 */
export interface AuthenticationResult<
	TUser extends SchemaDefinition = SchemaDefinition,
> {
	readonly principal: AuthPrincipal<TUser>
	readonly session: IssuedAuthSession
	/** The current readable profile, required for authentication to succeed. */
	readonly user: Model<TUser>
}

/**
 * The result of a sign-up while `requireVerifiedEmail` waits for the email:
 * the readable profile, no session.
 */
export interface AuthPendingSignUp<
	TUser extends SchemaDefinition = SchemaDefinition,
> {
	/** The new user's readable profile. */
	readonly user: Model<TUser>
	/** Always `true`: verify the email, then log in. */
	readonly verificationRequired: true
}

/** The client of one HTTP request, recorded on the sessions it creates. */
export interface AuthClient {
	/**
	 * The client address, as the HTTP plugin resolves it; `undefined` when
	 * unknown. Sessions and events then record `null`, and attempt limiting
	 * applies only the per-account limit.
	 */
	readonly address: string | undefined
	/** The `User-Agent` header, at most 256 characters. */
	readonly userAgent: string | null
}

/** Identifies the authenticated principal of a request. */
export const authPrincipal: RequestContextValue<
	AuthPrincipal,
	'ultimabase.auth.principal'
> = new RequestContextValue<AuthPrincipal, 'ultimabase.auth.principal'>(
	'ultimabase.auth.principal',
	(value) => {
		if (!isAuthPrincipal(value)) {
			throw new TypeError('Auth principal must be package-owned')
		}
		return value
	},
)

/** Identifies the session that authenticated a request. */
export const authSession: RequestContextValue<
	AuthSession,
	'ultimabase.auth.session'
> = new RequestContextValue<AuthSession, 'ultimabase.auth.session'>(
	'ultimabase.auth.session',
	(value) => {
		if (!isAuthSession(value)) {
			throw new TypeError('Auth session must be package-owned')
		}
		return value
	},
)

/** Carries the HTTP client of a request for attempt limiting and sessions. */
export const authClient: RequestContextValue<
	AuthClient,
	'ultimabase.auth.client'
> = new RequestContextValue<AuthClient, 'ultimabase.auth.client'>(
	'ultimabase.auth.client',
	(value) => {
		if (
			!isPlainRecord(value) ||
			(value.address !== undefined && typeof value.address !== 'string') ||
			(value.userAgent !== null && typeof value.userAgent !== 'string')
		) {
			throw new TypeError('Auth client must carry an address and user agent')
		}
		return immutableRecord({
			address: value.address,
			userAgent: value.userAgent,
		})
	},
)

/** Creates one opaque bearer token and its non-reversible storage digest. */
export const createSessionToken = (): Readonly<{
	readonly digest: string
	readonly token: string
}> => {
	const token = `ub_s1.${randomBytes(32).toString('base64url')}`
	return immutableRecord({ digest: digestSessionToken(token), token })
}

/** Produces a stable digest without retaining the raw token. */
export const digestSessionToken = (token: string): string =>
	createHash('sha256').update(token).digest('hex')

/** Rejects malformed tokens before owner-private storage access. */
export const isSessionToken = (value: unknown): value is string =>
	typeof value === 'string' && rawTokenPattern.test(value)

/** Creates one immutable package-owned context session. */
export const createAuthSession = (
	value: Omit<AuthSession, typeof authSessionBrand>,
	sessionGeneration: number,
): AuthSession => {
	const session = immutableRecord(value) as AuthSession
	authSessionGenerations.set(session, sessionGeneration)
	return session
}

const isAuthSession = (value: unknown): value is AuthSession =>
	isPlainRecord(value) && authSessionGenerations.has(value)

// Credential proofs made through each context session during its scope: the
// session value is immutable, so a scope that reauthenticates sees its new
// proof here (and its next scopes in the stored session).
const authSessionProofs = new WeakMap<AuthSession, number>()

/** Records a credential proof already stored on this context session. */
export const recordSessionAuthentication = (
	session: AuthSession,
	at: number,
): void => {
	authSessionProofs.set(
		session,
		Math.max(at, authSessionProofs.get(session) ?? at),
	)
}

/** When the user last proved a credential through this context session. */
export const readSessionAuthenticatedAt = (session: AuthSession): number =>
	Math.max(
		Date.parse(session.authenticatedAt),
		authSessionProofs.get(session) ?? Number.NEGATIVE_INFINITY,
	)

/** Reads the private account generation of one nominal session. */
export const readSessionGeneration = (session: AuthSession): number => {
	const generation = authSessionGenerations.get(session)
	if (generation === undefined) {
		throw new TypeError('Auth session generation is unavailable')
	}
	return generation
}
