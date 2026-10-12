import {
	FrameworkError,
	type OperationOptions,
	type SchemaReference,
} from '@ultimabase/core'
import { RequestContext } from '@ultimabase/core/plugin'
import { immutableRecord } from '@ultimabase/shared'

import { createAuthPrincipal } from './principal.js'
import {
	authPrincipal,
	authSession,
	type AuthenticationResult,
} from './session.js'
import type { IssuedSessionPair } from './sessions.js'

/** Reads one User profile, rejecting a missing or filtered-out row uniformly. */
export const readUserProfile = async (
	user: SchemaReference<string>,
	userId: string,
	options?: OperationOptions,
): Promise<object> => {
	const profile: unknown = await user.findOne(
		{ where: { id: userId } },
		options,
	)
	if (typeof profile !== 'object' || profile === null) {
		throw new FrameworkError('NOT_FOUND', 'Auth User is not readable.', {
			publicMessage: 'The requested object was not found.',
		})
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
