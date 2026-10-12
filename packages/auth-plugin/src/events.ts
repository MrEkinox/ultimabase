import { runAfterCommit } from '@ultimabase/core/plugin'
import {
	immutableRecord,
	isPlainRecord,
	type MaybePromise,
} from '@ultimabase/shared'

/** Fields every authentication event carries. */
export interface AuthEventBase {
	/** The ISO time of the change. */
	readonly occurredAt: string
	/** The request that caused the event, for log correlation. */
	readonly requestId: string
}

/**
 * A user signed up through a method; a session was issued, except while
 * `requireVerifiedEmail` waits for verification (`sessionId: null`).
 */
export interface AuthSignUpEvent extends AuthEventBase {
	readonly address: string | null
	readonly method: string
	readonly sessionId: string | null
	readonly userId: string
}

/** A user logged in through a method; a session was issued. */
export interface AuthLoginEvent extends AuthEventBase {
	readonly address: string | null
	readonly method: string
	readonly sessionId: string
	readonly userId: string
}

/** A login failed; `limited` tells whether attempt limiting refused it. */
export interface AuthLoginFailedEvent extends AuthEventBase {
	/** The client address (personal data), or `null` when unknown. */
	readonly address: string | null
	/** The normalized identifier the attempt targeted (personal data), never a password. */
	readonly identifier: string
	readonly limited: boolean
	readonly method: string
}

/** Sessions ended: one (`sessionId`), or every session of the user. */
export interface AuthLogoutEvent extends AuthEventBase {
	readonly everywhere: boolean
	readonly sessionId: string | null
	readonly userId: string
}

/** A password was reset through a reset token; every session was revoked. */
export interface AuthPasswordResetEvent extends AuthEventBase {
	readonly userId: string
}

/** The user's email was verified (a verification token or a password reset). */
export interface AuthEmailVerifiedEvent extends AuthEventBase {
	/** The verified email (personal data). */
	readonly email: string
	readonly userId: string
}

/** The user confirmed a new email, now verified. */
export interface AuthEmailChangedEvent extends AuthEventBase {
	/** The new email (personal data). */
	readonly email: string
	/** The replaced email (personal data). */
	readonly previousEmail: string
	readonly userId: string
}

/** Every authentication event by name. */
export interface AuthEvents {
	readonly afterEmailChanged: AuthEmailChangedEvent
	readonly afterEmailVerified: AuthEmailVerifiedEvent
	readonly afterLogin: AuthLoginEvent
	readonly afterLoginFailed: AuthLoginFailedEvent
	readonly afterLogout: AuthLogoutEvent
	readonly afterPasswordReset: AuthPasswordResetEvent
	readonly afterSignUp: AuthSignUpEvent
}

/**
 * Application handlers of authentication events. Each runs after the
 * transaction that caused it commits, outside the request, best effort: a
 * failure is logged and never fails the call (ADR-0318). Payloads never
 * contain passwords or tokens.
 *
 * @example `authPlugin({ methods, events: { afterLogin: (event) => audit(event) } })`
 */
export type AuthEventHandlers = {
	readonly [TName in keyof AuthEvents]?: (
		event: AuthEvents[TName],
	) => MaybePromise<void>
}

const eventNames: ReadonlySet<string> = new Set([
	'afterEmailChanged',
	'afterEmailVerified',
	'afterLogin',
	'afterLoginFailed',
	'afterLogout',
	'afterPasswordReset',
	'afterSignUp',
])

/** Validates and snapshots the `events` option. */
export const resolveAuthEventHandlers = (value: unknown): AuthEventHandlers => {
	if (value === undefined) return immutableRecord({})
	if (!isPlainRecord(value)) {
		throw new TypeError('authPlugin events must be a plain object')
	}
	for (const [name, handler] of Object.entries(value)) {
		if (!eventNames.has(name)) {
			throw new TypeError(`authPlugin events contains unknown event: ${name}`)
		}
		if (typeof handler !== 'function') {
			throw new TypeError(`authPlugin events.${name} must be a function`)
		}
	}
	const handlers: AuthEventHandlers = immutableRecord({ ...value })
	return handlers
}

/** Queues one event after the current transaction commits. */
export type AuthEventEmitter = <const TName extends keyof AuthEvents>(
	name: TName,
	payload: Omit<AuthEvents[TName], keyof AuthEventBase>,
	requestId: string,
) => void

/** Creates the emitter of one plugin instance. */
export const createAuthEventEmitter =
	(handlers: AuthEventHandlers): AuthEventEmitter =>
	(name, payload, requestId) => {
		const handler = handlers[name] as
			((event: AuthEvents[typeof name]) => MaybePromise<void>) | undefined
		if (handler === undefined) return
		const event = immutableRecord({
			...payload,
			occurredAt: new Date().toISOString(),
			requestId,
		}) as AuthEvents[typeof name]
		runAfterCommit(() => handler(event))
	}
