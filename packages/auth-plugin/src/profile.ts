import {
	FrameworkError,
	type OperationOptions,
	type SchemaReference,
} from '@ultimabase/core'

import { rejectUnreadableUser } from './errors.js'
import { RequestContext } from '@ultimabase/core/plugin'
import { immutableRecord } from '@ultimabase/shared'

import { createAuthPrincipal } from './principal.js'
import {
	authPrincipal,
	authSession,
	type AuthenticationResult,
} from './session.js'
import type { IssuedSessionPair } from './sessions.js'

/**
 * Reads one User profile as its owner. A row the read rule denies or filters
 * out fails with `AUTH_USER_NOT_READABLE`, which names the missing rule
 * (ADR-0341).
 */
export const readUserProfile = async (
	user: SchemaReference<string>,
	userId: string,
	options?: OperationOptions,
): Promise<object> => {
	let profile: unknown
	try {
		profile = await user.findOne({ where: { id: userId } }, options)
	} catch (error: unknown) {
		if (error instanceof FrameworkError && error.code === 'PERMISSION_DENIED') {
			return rejectUnreadableUser(user.className, error)
		}
		throw error
	}
	if (typeof profile !== 'object' || profile === null) {
		return rejectUnreadableUser(user.className, undefined)
	}
	return profile
}

/**
 * Reads the profile in the authentication transaction as the newly issued
 * identity, never with a caller's Master grant or sign-up's elevation.
 */
export const readAuthenticationResult = async (
	user: SchemaReference<string>,
	userId: string,
	session: IssuedSessionPair,
	request: RequestContext,
): Promise<AuthenticationResult> => {
	const principal = createAuthPrincipal(user.pointer(userId))
	const context = RequestContext.anonymous({
		requestId: request.requestId,
		signal: request.signal,
		source: request.source,
	})
		.withValue(authPrincipal, principal)
		.withValue(authSession, session.context)
	// A missing or unreadable profile aborts the whole authentication.
	const profile = await readUserProfile(user, userId, { context })
	return immutableRecord({
		principal,
		session: immutableRecord(session.issued),
		user: profile,
	}) as AuthenticationResult
}

/**
 * Reads the profile of a new user as that user, without a session, when a
 * sign-up issues none.
 */
export const readNewUserProfile = async (
	user: SchemaReference<string>,
	userId: string,
	request: RequestContext,
): Promise<object> => {
	const context = RequestContext.anonymous({
		requestId: request.requestId,
		signal: request.signal,
		source: request.source,
	}).withValue(authPrincipal, createAuthPrincipal(user.pointer(userId)))
	return readUserProfile(user, userId, { context })
}
