import {
	defineOperation,
	type PluginOperationDefinition,
	type PluginOperationPublicDeclaration,
	type PluginOperationTransaction,
	type PluginOperationValueContract,
} from '@ultimabase/core/plugin'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { AuthMethodInfo } from './accounts.js'
import { authErrorCodes } from './errors.js'
import type { AuthenticationResult } from './session.js'
import type { AuthSessionInfo } from './sessions.js'
import {
	acknowledgement,
	authenticationResult,
	idInput,
	listResult,
	nullInput,
	profileResult,
} from './values.js'

/** The input naming one session or linked method. */
export interface AuthIdInput {
	readonly id: string
}

/** Acknowledges a logout or a revoked session. */
export interface AuthLogoutResult {
	readonly revoked: true
}

/** The live sessions of the current user. */
export interface AuthSessionList {
	readonly sessions: readonly AuthSessionInfo[]
}

/** The sign-in methods linked to the current user. */
export interface AuthMethodList {
	readonly methods: readonly AuthMethodInfo[]
}

/** Acknowledges a removed sign-in method. */
export interface AuthUnlinkResult {
	readonly unlinked: true
}

/** Acknowledges a deleted account. */
export interface AuthDeleteAccountResult {
	readonly deleted: true
}

type AuthOperation<
	TName extends string,
	TInput,
	TResult,
	TErrors extends readonly string[],
> = PluginOperationDefinition<
	`ultimabase.auth.${TName}`,
	'1.0.0',
	'application',
	TInput,
	TResult,
	TErrors
>

const operation = <
	const TName extends string,
	TInput,
	TResult,
	const TErrors extends readonly string[],
>(
	name: TName,
	transaction: PluginOperationTransaction,
	input: PluginOperationValueContract<TInput>,
	result: PluginOperationValueContract<TResult>,
	errors: TErrors,
): AuthOperation<TName, TInput, TResult, TErrors> =>
	defineOperation({
		errors,
		input,
		name: `ultimabase.auth.${name}`,
		result,
		target: 'application',
		transaction,
		version: '1.0.0',
	})

const session = [authErrorCodes.invalidSession] as const

const currentOperation: AuthOperation<
	'current',
	null,
	Readonly<Record<string, unknown>>,
	readonly ['AUTH_INVALID_SESSION']
> = operation('current', 'optional', nullInput, profileResult, session)
const refreshOperation: AuthOperation<
	'refresh',
	null,
	AuthenticationResult,
	readonly ['AUTH_EMAIL_NOT_VERIFIED', 'AUTH_INVALID_SESSION']
> = operation('refresh', 'required', nullInput, authenticationResult, [
	authErrorCodes.emailNotVerified,
	authErrorCodes.invalidSession,
])
const logoutOperation: AuthOperation<
	'logout',
	null,
	AuthLogoutResult,
	readonly ['AUTH_INVALID_SESSION']
> = operation(
	'logout',
	'required',
	nullInput,
	acknowledgement('revoked'),
	session,
)
const logoutEverywhereOperation: AuthOperation<
	'logout-everywhere',
	null,
	AuthLogoutResult,
	readonly ['AUTH_INVALID_SESSION']
> = operation(
	'logout-everywhere',
	'required',
	nullInput,
	acknowledgement('revoked'),
	session,
)
const listSessionsOperation: AuthOperation<
	'list-sessions',
	null,
	AuthSessionList,
	readonly ['AUTH_INVALID_SESSION']
> = operation(
	'list-sessions',
	'optional',
	nullInput,
	listResult<'sessions', AuthSessionInfo>('sessions'),
	session,
)
const revokeSessionOperation: AuthOperation<
	'revoke-session',
	AuthIdInput,
	AuthLogoutResult,
	readonly ['AUTH_INVALID_SESSION', 'AUTH_NOT_FOUND']
> = operation(
	'revoke-session',
	'required',
	idInput,
	acknowledgement('revoked'),
	[authErrorCodes.invalidSession, authErrorCodes.notFound],
)
const listMethodsOperation: AuthOperation<
	'list-methods',
	null,
	AuthMethodList,
	readonly ['AUTH_INVALID_SESSION']
> = operation(
	'list-methods',
	'optional',
	nullInput,
	listResult<'methods', AuthMethodInfo>('methods'),
	session,
)
const unlinkMethodOperation: AuthOperation<
	'unlink-method',
	AuthIdInput,
	AuthUnlinkResult,
	readonly [
		'AUTH_INVALID_SESSION',
		'AUTH_LAST_METHOD',
		'AUTH_NOT_FOUND',
		'AUTH_REAUTHENTICATION_REQUIRED',
	]
> = operation(
	'unlink-method',
	'required',
	idInput,
	acknowledgement('unlinked'),
	[
		authErrorCodes.invalidSession,
		authErrorCodes.lastMethod,
		authErrorCodes.notFound,
		authErrorCodes.reauthenticationRequired,
	],
)
const deleteAccountOperation: AuthOperation<
	'delete-account',
	null,
	AuthDeleteAccountResult,
	readonly ['AUTH_INVALID_SESSION', 'AUTH_REAUTHENTICATION_REQUIRED']
> = operation(
	'delete-account',
	'required',
	nullInput,
	acknowledgement('deleted'),
	[authErrorCodes.invalidSession, authErrorCodes.reauthenticationRequired],
)

// The `typeof` members keep hovers on the named private constants.
/**
 * The foundation's operations, all public (ADR-0324) and served under
 * `/api/auth` and in GraphQL only (ADR-0341);
 * `graphqlPlugin({ hide: [authOperations.deleteAccount] })` hides one.
 */
export const authOperations: Readonly<{
	readonly current: typeof currentOperation
	readonly deleteAccount: typeof deleteAccountOperation
	readonly listMethods: typeof listMethodsOperation
	readonly listSessions: typeof listSessionsOperation
	readonly logout: typeof logoutOperation
	readonly logoutEverywhere: typeof logoutEverywhereOperation
	readonly refresh: typeof refreshOperation
	readonly revokeSession: typeof revokeSessionOperation
	readonly unlinkMethod: typeof unlinkMethodOperation
}> = immutableRecord({
	current: currentOperation,
	deleteAccount: deleteAccountOperation,
	listMethods: listMethodsOperation,
	listSessions: listSessionsOperation,
	logout: logoutOperation,
	logoutEverywhere: logoutEverywhereOperation,
	refresh: refreshOperation,
	revokeSession: revokeSessionOperation,
	unlinkMethod: unlinkMethodOperation,
})

/** One foundation operation. */
export type AuthFoundationOperation =
	(typeof authOperations)[keyof typeof authOperations]

const nullSchema = immutableRecord({ type: 'null' })
const idSchema = immutableRecord({
	type: 'object',
	properties: immutableRecord({ id: immutableRecord({ type: 'string' }) }),
	required: immutableArray(['id']),
	additionalProperties: false,
})

/** The public names and input schemas of the foundation's operations. */
export const authPublicOperations: Readonly<
	Record<keyof typeof authOperations, PluginOperationPublicDeclaration>
> = immutableRecord({
	current: immutableRecord({ name: 'current', input: nullSchema }),
	deleteAccount: immutableRecord({ name: 'deleteAccount', input: nullSchema }),
	listMethods: immutableRecord({ name: 'listMethods', input: nullSchema }),
	listSessions: immutableRecord({ name: 'listSessions', input: nullSchema }),
	logout: immutableRecord({ name: 'logout', input: nullSchema }),
	logoutEverywhere: immutableRecord({
		name: 'logoutEverywhere',
		input: nullSchema,
	}),
	refresh: immutableRecord({ name: 'refresh', input: nullSchema }),
	revokeSession: immutableRecord({ name: 'revokeSession', input: idSchema }),
	unlinkMethod: immutableRecord({ name: 'unlinkMethod', input: idSchema }),
})
