import {
	FrameworkError,
	RequestContext,
	type OperationOptions,
	type SchemaReference,
	type SchemaResult,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

import { createPasswordPrincipal } from './principal.js'
import {
	passwordPrincipal,
	passwordSession,
	type IssuedPasswordSession,
	type PasswordAuthenticationResult,
	type PasswordSession,
} from './session.js'
import type { PasswordUserReference } from './user-schema.js'

/** Reads one User profile, rejecting a missing or filtered-out row uniformly. */
export const readPasswordProfile = async <
	TUser extends SchemaReference<'User'>,
>(
	user: TUser,
	userId: string,
	options?: OperationOptions,
): Promise<SchemaResult<TUser>> => {
	const profile = await user.findOne({ where: { id: userId } }, options)
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
