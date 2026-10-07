import { randomUUID } from 'node:crypto'

import {
	requestSources,
	type AnonymousRequestAccess,
	type ApplicationCallbackExecutor,
	type ApplicationRequestExecutor,
	type PluginIdentity,
	type RequestContext,
} from '@ultimabase/core'
import { immutableRecord, type MaybePromise } from '@ultimabase/shared'

import { createPasswordPrincipal } from './principal.js'
import type { PasswordCredentialCollection } from './credentials.js'
import { passwordPrincipal, passwordSession } from './session.js'
import {
	validatePasswordSessionToken,
	type PasswordSessionCollection,
} from './sessions.js'
import type { PasswordUserReference } from './user-schema.js'
import { rejectPasswordSession } from './operations.js'

/** Exposes application-bound authenticated execution without raw Runtime access. */
export interface PasswordAuthPluginExports {
	/** Validates one token, then runs the callback with ambient authenticated identity. */
	runWithSession<TResult>(
		token: string,
		handler: () => MaybePromise<TResult>,
	): Promise<TResult>
}

/** Creates the setup export while retaining exact plugin callback attribution. */
export const createPasswordAuthPluginExports = (options: {
	readonly callbacks: ApplicationCallbackExecutor
	readonly credentials: PasswordCredentialCollection
	readonly executor: ApplicationRequestExecutor
	readonly owner: PluginIdentity
	readonly sessions: PasswordSessionCollection
	readonly user: PasswordUserReference
}): PasswordAuthPluginExports =>
	immutableRecord({
		runWithSession: async <TResult>(
			token: string,
			handler: () => MaybePromise<TResult>,
		): Promise<TResult> => {
			if (typeof handler !== 'function') {
				throw new TypeError('runWithSession handler must be a function')
			}
			const anonymous = options.callbacks.runPlugin(options.owner, () =>
				options.executor.createAnonymousContext({
					requestId: randomUUID(),
					source: requestSources.internal,
				}),
			)
			return options.callbacks.runPlugin(options.owner, () =>
				options.executor.runWithContext(anonymous, async () => {
					const validated = await validatePasswordSessionToken(
						options.sessions,
						options.credentials,
						token,
					)
					if (validated === undefined) return rejectPasswordSession()
					const principal = createPasswordPrincipal(
						options.user.pointer(validated.userId),
					)
					const context: RequestContext<AnonymousRequestAccess, 'internal'> =
						anonymous
							.withValue(passwordPrincipal, principal)
							.withValue(passwordSession, validated.context)
					return options.executor.runWithContext(context, () => handler())
				}),
			)
		},
	})
