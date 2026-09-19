import { RequestContext } from '@ultimabase/core'

import { createPasswordPrincipal } from './principal.js'
import {
	createPasswordAuthenticationResult,
	passwordPrincipal,
	passwordSession,
	type IssuedPasswordSession,
	type PasswordAuthenticationResult,
	type PasswordSession,
} from './session.js'
import type { PasswordUserDefinition } from './user-schema.js'

/** Reads the profile in the auth transaction with only the newly issued identity. */
export const readPasswordAuthenticationResult = async (
	user: PasswordUserDefinition,
	userId: string,
	session: Readonly<{
		readonly context: PasswordSession
		readonly issued: IssuedPasswordSession
	}>,
	request: RequestContext,
): Promise<PasswordAuthenticationResult> => {
	// Never inherit signup's temporary elevation, a caller's Master grant, or a
	// different user's subjects. Operation options retain the active transaction.
	const context = RequestContext.anonymous({
		requestId: request.requestId,
		signal: request.signal,
		source: request.source,
	})
		.withValue(passwordPrincipal, createPasswordPrincipal(user.pointer(userId)))
		.withValue(passwordSession, session.context)
	// Pointer reads normalize only Core-proven policy denials to absence before
	// transaction failure tracking; infrastructure and callback errors still abort.
	const profile = await user.pointer(userId).findOne(undefined, { context })
	return createPasswordAuthenticationResult(
		user,
		userId,
		session.issued,
		profile,
	)
}
