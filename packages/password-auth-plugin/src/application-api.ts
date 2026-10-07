import { randomUUID } from 'node:crypto'

import {
	requestSources,
	type ApplicationCallbackExecutor,
	type ApplicationRequestExecutor,
	type PluginIdentity,
} from '@ultimabase/core'
import { immutableRecord, type MaybePromise } from '@ultimabase/shared'

import type { PasswordCredentialCollection } from './credentials.js'
import { rejectPasswordSession } from './operations.js'
import { createPasswordPrincipal } from './principal.js'
import { passwordPrincipal, passwordSession } from './session.js'
import {
	validatePasswordSessionToken,
	type PasswordSessionCollection,
} from './sessions.js'
import type { PasswordUserReference } from './user-schema.js'

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
}): PasswordAuthPluginExports => {
	const { callbacks, executor, owner } = options
	return immutableRecord({
		runWithSession: async <TResult>(
			token: string,
			handler: () => MaybePromise<TResult>,
		): Promise<TResult> => {
			if (typeof handler !== 'function') {
				throw new TypeError('runWithSession handler must be a function')
			}
			const anonymous = callbacks.runPlugin(owner, () =>
				executor.createAnonymousContext({
					requestId: randomUUID(),
					source: requestSources.internal,
				}),
			)
			return callbacks.runPlugin(owner, () =>
				executor.runWithContext(anonymous, async () => {
					const validated = await validatePasswordSessionToken(
						options.sessions,
						options.credentials,
						token,
					)
					if (validated === undefined) return rejectPasswordSession()
					const context = anonymous
						.withValue(
							passwordPrincipal,
							createPasswordPrincipal(options.user.pointer(validated.userId)),
						)
						.withValue(passwordSession, validated.context)
					return executor.runWithContext(context, () => handler())
				}),
			)
		},
	})
}
