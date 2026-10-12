import {
	PluginError,
	defineOperationTransport,
	operationTransportBinding,
	operationWireCodec,
	type OperationTransportBindingDefinition,
	type SchemaResult,
} from '@ultimabase/core'
import {
	defineOperation,
	defineOperationValue,
	defineTypegenReference,
	type PluginOperationDefinition,
	type PluginOperationInput,
	type PluginOperationResult,
	type PluginOperationTransaction,
	type PluginOperationValueContract,
} from '@ultimabase/core/plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { isPasswordPrincipal, type PasswordPrincipal } from './principal.js'
import {
	snapshotPasswordSignUpInput,
	type PasswordSignUpInput,
} from './sign-up-input.js'
import type { PasswordUserReference } from './user-schema.js'
import {
	isPasswordSessionToken,
	type PasswordAuthenticationResult,
	type PasswordChangeResult,
	type PasswordLogoutResult,
} from './session.js'

/** Carries the exact credential input accepted by login. */
export interface PasswordCredentialsInput {
	readonly password: string
	readonly username: string
}

/** Carries the two secrets required to replace one authenticated password. */
export interface PasswordChangeInput {
	readonly currentPassword: string
	readonly newPassword: string
}

/** Lists the complete stable Password Auth public failure vocabulary. */
export const passwordAuthErrorCodes: Readonly<{
	readonly invalidCredentials: 'PASSWORD_AUTH_INVALID_CREDENTIALS'
	readonly invalidSession: 'PASSWORD_AUTH_INVALID_SESSION'
	readonly passwordChangeRejected: 'PASSWORD_AUTH_PASSWORD_CHANGE_REJECTED'
	readonly signUpRejected: 'PASSWORD_AUTH_SIGN_UP_REJECTED'
}> = immutableRecord({
	invalidCredentials: 'PASSWORD_AUTH_INVALID_CREDENTIALS',
	invalidSession: 'PASSWORD_AUTH_INVALID_SESSION',
	passwordChangeRejected: 'PASSWORD_AUTH_PASSWORD_CHANGE_REJECTED',
	signUpRejected: 'PASSWORD_AUTH_SIGN_UP_REJECTED',
} as const)

const rejection =
	(
		code: (typeof passwordAuthErrorCodes)[keyof typeof passwordAuthErrorCodes],
		message: string,
		publicMessage: string,
	) =>
	(): never => {
		throw new PluginError(code, message, { publicMessage })
	}

/** Creates the uniform public sign-up rejection. */
export const rejectPasswordSignUp: () => never = rejection(
	passwordAuthErrorCodes.signUpRejected,
	'Password Auth sign-up was rejected.',
	'Sign-up was rejected.',
)

/** Creates the enumeration-safe login rejection. */
export const rejectPasswordCredentials: () => never = rejection(
	passwordAuthErrorCodes.invalidCredentials,
	'Password Auth credentials were rejected.',
	'Invalid credentials.',
)

/** Creates one non-enumerating rejection for current or replacement secrets. */
export const rejectPasswordChange: () => never = rejection(
	passwordAuthErrorCodes.passwordChangeRejected,
	'Password Auth password change was rejected.',
	'Password change was rejected.',
)

/** Creates the uniform invalid, expired, revoked, or stale session rejection. */
export const rejectPasswordSession: () => never = rejection(
	passwordAuthErrorCodes.invalidSession,
	'Password Auth session was rejected.',
	'Invalid session.',
)

const reference = (exportName: string) =>
	defineTypegenReference({
		exportName,
		module: '@ultimabase/password-auth-plugin',
	})

const credentialsInput = defineOperationValue<PasswordCredentialsInput>(
	(value, path) => {
		if (
			!isPlainRecord(value) ||
			Object.keys(value).length !== 2 ||
			typeof value.password !== 'string' ||
			typeof value.username !== 'string'
		) {
			throw new TypeError(`${path} must contain exactly username and password`)
		}
		return immutableRecord({
			password: value.password,
			username: value.username,
		})
	},
	reference('PasswordCredentialsInput'),
)

const nullInput = defineOperationValue<null>((value, path) => {
	if (value !== null) throw new TypeError(`${path} must be null`)
	return null
})

const passwordChangeInput = defineOperationValue<PasswordChangeInput>(
	(value, path) => {
		if (
			!isPlainRecord(value) ||
			Object.keys(value).length !== 2 ||
			typeof value.currentPassword !== 'string' ||
			typeof value.newPassword !== 'string'
		) {
			throw new TypeError(
				`${path} must contain exactly currentPassword and newPassword`,
			)
		}
		return immutableRecord({
			currentPassword: value.currentPassword,
			newPassword: value.newPassword,
		})
	},
	reference('PasswordChangeInput'),
)

const signUpInput = defineOperationValue(
	snapshotPasswordSignUpInput,
	reference('PasswordSignUpInput'),
)

const isUserProfile = (
	value: unknown,
	principal: PasswordPrincipal,
): value is SchemaResult<PasswordUserReference> => {
	// Results are frozen plain data (ADR-0310): the profile is the principal's row.
	return (
		isPlainRecord(value) &&
		Object.isFrozen(value) &&
		value.id === principal.user.id
	)
}

const authenticationResult = defineOperationValue<PasswordAuthenticationResult>(
	(value, path) => {
		if (
			!isPlainRecord(value) ||
			Object.keys(value).length !== 3 ||
			!isPasswordPrincipal(value.principal) ||
			!isUserProfile(value.user, value.principal) ||
			!isPlainRecord(value.session) ||
			Object.keys(value.session).length !== 4 ||
			typeof value.session.absoluteExpiresAt !== 'string' ||
			typeof value.session.expiresAt !== 'string' ||
			typeof value.session.id !== 'string' ||
			!isPasswordSessionToken(value.session.token)
		) {
			throw new TypeError(`${path} must be a Password Auth result`)
		}
		return immutableRecord({
			principal: value.principal,
			user: value.user,
			session: immutableRecord({
				absoluteExpiresAt: value.session.absoluteExpiresAt,
				expiresAt: value.session.expiresAt,
				id: value.session.id,
				token: value.session.token,
			}),
		})
	},
	reference('PasswordAuthenticationResult'),
)

const logoutResult = defineOperationValue<PasswordLogoutResult>(
	(value, path) => {
		if (
			!isPlainRecord(value) ||
			Object.keys(value).length !== 1 ||
			value.revoked !== true
		) {
			throw new TypeError(`${path} must acknowledge session revocation`)
		}
		return immutableRecord({ revoked: true as const })
	},
	reference('PasswordLogoutResult'),
)

const passwordChangeResult = defineOperationValue<PasswordChangeResult>(
	(value, path) => {
		if (
			!isPlainRecord(value) ||
			Object.keys(value).length !== 1 ||
			value.changed !== true
		) {
			throw new TypeError(`${path} must acknowledge a changed password`)
		}
		return immutableRecord({ changed: true as const })
	},
	reference('PasswordChangeResult'),
)

/** Declares one application operation in the Password Auth namespace. */
const authOperation = <
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
): PluginOperationDefinition<
	`ultimabase.password-auth.${TName}`,
	'1.0.0',
	'application',
	TInput,
	TResult,
	TErrors
> =>
	defineOperation({
		errors,
		input,
		name: `ultimabase.password-auth.${name}`,
		result,
		target: 'application',
		transaction,
		version: '1.0.0',
	})

// Credential and password work stays outside transactions; each handler opens
// its own short transaction after hashing.
const loginOperation: PluginOperationDefinition<
	'ultimabase.password-auth.login',
	'1.0.0',
	'application',
	PasswordCredentialsInput,
	PasswordAuthenticationResult,
	readonly ['PASSWORD_AUTH_INVALID_CREDENTIALS']
> = authOperation(
	'login',
	'forbidden',
	credentialsInput,
	authenticationResult,
	[passwordAuthErrorCodes.invalidCredentials],
)
const logoutOperation: PluginOperationDefinition<
	'ultimabase.password-auth.logout',
	'1.0.0',
	'application',
	null,
	PasswordLogoutResult,
	readonly ['PASSWORD_AUTH_INVALID_SESSION']
> = authOperation('logout', 'required', nullInput, logoutResult, [
	passwordAuthErrorCodes.invalidSession,
])
const logoutEverywhereOperation: PluginOperationDefinition<
	'ultimabase.password-auth.logout-everywhere',
	'1.0.0',
	'application',
	null,
	PasswordLogoutResult,
	readonly ['PASSWORD_AUTH_INVALID_SESSION']
> = authOperation('logout-everywhere', 'required', nullInput, logoutResult, [
	passwordAuthErrorCodes.invalidSession,
])
const changePasswordOperation: PluginOperationDefinition<
	'ultimabase.password-auth.change-password',
	'1.0.0',
	'application',
	PasswordChangeInput,
	PasswordChangeResult,
	readonly [
		'PASSWORD_AUTH_INVALID_SESSION',
		'PASSWORD_AUTH_PASSWORD_CHANGE_REJECTED',
	]
> = authOperation(
	'change-password',
	'forbidden',
	passwordChangeInput,
	passwordChangeResult,
	[
		passwordAuthErrorCodes.invalidSession,
		passwordAuthErrorCodes.passwordChangeRejected,
	],
)
const refreshOperation: PluginOperationDefinition<
	'ultimabase.password-auth.refresh',
	'1.0.0',
	'application',
	null,
	PasswordAuthenticationResult,
	readonly ['PASSWORD_AUTH_INVALID_SESSION']
> = authOperation('refresh', 'required', nullInput, authenticationResult, [
	passwordAuthErrorCodes.invalidSession,
])
const signUpOperation: PluginOperationDefinition<
	'ultimabase.password-auth.sign-up',
	'1.0.0',
	'application',
	PasswordSignUpInput,
	PasswordAuthenticationResult,
	readonly ['PASSWORD_AUTH_SIGN_UP_REJECTED']
> = authOperation('sign-up', 'forbidden', signUpInput, authenticationResult, [
	passwordAuthErrorCodes.signUpRejected,
])

// The `typeof` members keep the reference hover, which prints each operation
// through its named private constant.
/** Exposes the six nominal transport-neutral Password Auth operations. */
export const passwordAuthOperations: Readonly<{
	readonly changePassword: typeof changePasswordOperation
	readonly login: typeof loginOperation
	readonly logout: typeof logoutOperation
	readonly logoutEverywhere: typeof logoutEverywhereOperation
	readonly refresh: typeof refreshOperation
	readonly signUp: typeof signUpOperation
}> = immutableRecord({
	changePassword: changePasswordOperation,
	login: loginOperation,
	logout: logoutOperation,
	logoutEverywhere: logoutEverywhereOperation,
	refresh: refreshOperation,
	signUp: signUpOperation,
})

type PasswordAuthOperation =
	(typeof passwordAuthOperations)[keyof typeof passwordAuthOperations]

const restProtocol = defineOperationTransport({
	name: 'ultimabase.rest',
	version: '1.0.0',
})

/** Keeps REST and GraphQL identity data on the same required readable profile. */
export const toPasswordAuthenticationPayload = (
	value: PasswordAuthenticationResult,
): Pick<PasswordAuthenticationResult, 'session' | 'user'> =>
	immutableRecord({
		// The readable profile already carries the public user identity.
		session: value.session,
		user: value.user,
	})

/**
 * Snapshots wire input through the operation's own contract. With `reject`,
 * malformed input fails with the declared safe error instead of HTTP 500.
 */
export const decodePasswordAuthInput =
	<TInput>(
		contract: PluginOperationValueContract<TInput>,
		path: string,
		reject?: () => never,
	) =>
	(value: unknown): TInput => {
		try {
			return contract.snapshot(value, path)
		} catch (error: unknown) {
			if (reject === undefined || !(error instanceof TypeError)) throw error
			return reject()
		}
	}

const restBinding = <TOperation extends PasswordAuthOperation>(
	operation: TOperation,
	errors: Readonly<Record<string, 400 | 401>>,
	decode: (value: unknown) => PluginOperationInput<TOperation>,
	encode: (value: PluginOperationResult<TOperation>) => unknown,
	inputSchema?: string,
) =>
	operationTransportBinding({
		codec: operationWireCodec({
			decode,
			encode,
			operation,
			transport: restProtocol,
		}),
		metadata: immutableRecord({
			errors: immutableRecord(errors),
			// `ultimabase.password-auth.sign-up` is served at `/auth/sign-up`.
			path: `/auth/${operation.name.slice('ultimabase.password-auth.'.length)}`,
			...(inputSchema === undefined ? {} : { inputSchema }),
		}),
		operation,
	})

const sessionErrors = { [passwordAuthErrorCodes.invalidSession]: 401 } as const

/** Provides the independently named REST v1 bindings without importing REST. */
export const passwordAuthRestBindings: Readonly<
	Record<
		keyof typeof passwordAuthOperations,
		OperationTransportBindingDefinition
	>
> = immutableRecord({
	changePassword: restBinding(
		passwordAuthOperations.changePassword,
		{
			...sessionErrors,
			[passwordAuthErrorCodes.passwordChangeRejected]: 400,
		},
		decodePasswordAuthInput(
			passwordChangeInput,
			'change-password.wire-input',
			rejectPasswordChange,
		),
		(value) => value,
	),
	login: restBinding(
		passwordAuthOperations.login,
		{ [passwordAuthErrorCodes.invalidCredentials]: 401 },
		decodePasswordAuthInput(
			credentialsInput,
			'login.wire-input',
			rejectPasswordCredentials,
		),
		toPasswordAuthenticationPayload,
	),
	logout: restBinding(
		passwordAuthOperations.logout,
		sessionErrors,
		decodePasswordAuthInput(nullInput, 'logout.wire-input'),
		(value) => value,
	),
	logoutEverywhere: restBinding(
		passwordAuthOperations.logoutEverywhere,
		sessionErrors,
		decodePasswordAuthInput(nullInput, 'logout-everywhere.wire-input'),
		(value) => value,
	),
	refresh: restBinding(
		passwordAuthOperations.refresh,
		sessionErrors,
		decodePasswordAuthInput(nullInput, 'refresh.wire-input'),
		toPasswordAuthenticationPayload,
	),
	signUp: restBinding(
		passwordAuthOperations.signUp,
		{ [passwordAuthErrorCodes.signUpRejected]: 400 },
		decodePasswordAuthInput(
			signUpInput,
			'sign-up.wire-input',
			rejectPasswordSignUp,
		),
		toPasswordAuthenticationPayload,
		'User',
	),
})
