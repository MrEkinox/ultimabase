import {
	PluginError,
	Pointer,
	defineOperation,
	defineOperationTransport,
	defineOperationValue,
	defineTypegenReference,
	operationTransportBinding,
	operationWireCodec,
	type OperationTransportBindingDefinition,
	type PluginOperationDefinition,
	type PluginOperationInput,
	type PluginOperationResult,
	type TypegenReference,
	type SchemaResult,
} from '@ultimabase/core'
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
	type PasswordLogoutResult,
} from './session.js'

/** Carries the exact credential input accepted by login. */
export interface PasswordCredentialsInput {
	readonly password: string
	readonly username: string
}

/** Lists the complete stable Password Auth public failure vocabulary. */
export const passwordAuthErrorCodes: Readonly<{
	readonly invalidCredentials: 'PASSWORD_AUTH_INVALID_CREDENTIALS'
	readonly invalidSession: 'PASSWORD_AUTH_INVALID_SESSION'
	readonly signUpRejected: 'PASSWORD_AUTH_SIGN_UP_REJECTED'
}> = immutableRecord({
	invalidCredentials: 'PASSWORD_AUTH_INVALID_CREDENTIALS',
	invalidSession: 'PASSWORD_AUTH_INVALID_SESSION',
	signUpRejected: 'PASSWORD_AUTH_SIGN_UP_REJECTED',
} as const)

const credentialsInputReference = defineTypegenReference({
	exportName: 'PasswordCredentialsInput',
	module: '@ultimabase/password-auth-plugin',
})
const signUpInputReference = defineTypegenReference({
	exportName: 'PasswordSignUpInput',
	module: '@ultimabase/password-auth-plugin',
})
const authenticationResultReference = defineTypegenReference({
	exportName: 'PasswordAuthenticationResult',
	module: '@ultimabase/password-auth-plugin',
})
const logoutResultReference = defineTypegenReference({
	exportName: 'PasswordLogoutResult',
	module: '@ultimabase/password-auth-plugin',
})

/** Registers the exact public package types referenced by generated declarations. */
export const passwordAuthTypegenReferences: readonly TypegenReference[] = [
	credentialsInputReference,
	signUpInputReference,
	authenticationResultReference,
	logoutResultReference,
] as const

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
	credentialsInputReference,
)

const nullInput = defineOperationValue<null>((value, path) => {
	if (value !== null) throw new TypeError(`${path} must be null`)
	return null
})

const signUpInput = defineOperationValue(
	snapshotPasswordSignUpInput,
	signUpInputReference,
)

const isUserProfile = (
	value: unknown,
	principal: PasswordPrincipal,
): value is SchemaResult<PasswordUserReference> => {
	if (!(value instanceof principal.user.schema)) return false
	const prototype: unknown = Reflect.get(principal.user.schema, 'prototype')
	if (typeof prototype !== 'object' || prototype === null) return false
	const toPointer: unknown = Reflect.get(prototype, 'toPointer')
	if (typeof toPointer !== 'function') return false
	// The nominal model method rejects drafts and prototype-shaped impostors.
	const pointer: unknown = Reflect.apply(toPointer, value, [])
	return Pointer.is(pointer) && pointer.equals(principal.user)
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
	authenticationResultReference,
)

const logoutResult = defineOperationValue<PasswordLogoutResult>(
	(value, path) => {
		if (
			!isPlainRecord(value) ||
			Object.keys(value).length !== 1 ||
			value.revoked !== true
		) {
			throw new TypeError(`${path} must acknowledge one revoked session`)
		}
		return immutableRecord({ revoked: true as const })
	},
	logoutResultReference,
)

const loginOperation: PluginOperationDefinition<
	'ultimabase.password-auth.login',
	'1.0.0',
	'application',
	PasswordCredentialsInput,
	PasswordAuthenticationResult,
	readonly ['PASSWORD_AUTH_INVALID_CREDENTIALS']
> = defineOperation({
	errors: [passwordAuthErrorCodes.invalidCredentials] as const,
	input: credentialsInput,
	name: 'ultimabase.password-auth.login',
	result: authenticationResult,
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
})
const logoutOperation: PluginOperationDefinition<
	'ultimabase.password-auth.logout',
	'1.0.0',
	'application',
	null,
	PasswordLogoutResult,
	readonly ['PASSWORD_AUTH_INVALID_SESSION']
> = defineOperation({
	errors: [passwordAuthErrorCodes.invalidSession] as const,
	input: nullInput,
	name: 'ultimabase.password-auth.logout',
	result: logoutResult,
	target: 'application',
	transaction: 'required',
	version: '1.0.0',
})
const refreshOperation: PluginOperationDefinition<
	'ultimabase.password-auth.refresh',
	'1.0.0',
	'application',
	null,
	PasswordAuthenticationResult,
	readonly ['PASSWORD_AUTH_INVALID_SESSION']
> = defineOperation({
	errors: [passwordAuthErrorCodes.invalidSession] as const,
	input: nullInput,
	name: 'ultimabase.password-auth.refresh',
	result: authenticationResult,
	target: 'application',
	transaction: 'required',
	version: '1.0.0',
})
const signUpOperation: PluginOperationDefinition<
	'ultimabase.password-auth.sign-up',
	'1.0.0',
	'application',
	PasswordSignUpInput,
	PasswordAuthenticationResult,
	readonly ['PASSWORD_AUTH_SIGN_UP_REJECTED']
> = defineOperation({
	errors: [passwordAuthErrorCodes.signUpRejected] as const,
	input: signUpInput,
	name: 'ultimabase.password-auth.sign-up',
	result: authenticationResult,
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
})

/** Exposes the four nominal transport-neutral Password Auth operations. */
export const passwordAuthOperations: Readonly<{
	readonly login: typeof loginOperation
	readonly logout: typeof logoutOperation
	readonly refresh: typeof refreshOperation
	readonly signUp: typeof signUpOperation
}> = immutableRecord({
	login: loginOperation,
	logout: logoutOperation,
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

const createRestBinding = <TOperation extends PasswordAuthOperation>(
	operation: TOperation,
	path: string,
	status: 400 | 401,
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
			errors: immutableRecord({ [operation.errors[0] as string]: status }),
			path,
			...(inputSchema === undefined ? {} : { inputSchema }),
		}),
		operation,
	})

/** Provides the independently named REST v1 bindings without importing REST. */
export const passwordAuthRestBindings: Readonly<
	Record<
		keyof typeof passwordAuthOperations,
		OperationTransportBindingDefinition
	>
> = immutableRecord({
	login: createRestBinding(
		passwordAuthOperations.login,
		'/auth/login',
		401,
		(value) => {
			try {
				return credentialsInput.snapshot(value, 'login.wire-input')
			} catch (error: unknown) {
				if (!(error instanceof TypeError)) throw error
				// Invalid public credentials use the declared safe error, never HTTP 500.
				return rejectPasswordCredentials()
			}
		},
		toPasswordAuthenticationPayload,
	),
	logout: createRestBinding(
		passwordAuthOperations.logout,
		'/auth/logout',
		401,
		(value) => nullInput.snapshot(value, 'logout.wire-input'),
		(value) => value,
	),
	refresh: createRestBinding(
		passwordAuthOperations.refresh,
		'/auth/refresh',
		401,
		(value) => nullInput.snapshot(value, 'refresh.wire-input'),
		toPasswordAuthenticationPayload,
	),
	signUp: createRestBinding(
		passwordAuthOperations.signUp,
		'/auth/sign-up',
		400,
		(value) => {
			try {
				return signUpInput.snapshot(value, 'sign-up.wire-input')
			} catch (error: unknown) {
				if (!(error instanceof TypeError)) throw error
				return rejectPasswordSignUp()
			}
		},
		toPasswordAuthenticationPayload,
		'User',
	),
})

/** Creates the uniform public sign-up rejection. */
export const rejectPasswordSignUp = (): never => {
	throw new PluginError(
		passwordAuthErrorCodes.signUpRejected,
		'Password Auth sign-up was rejected.',
		{ publicMessage: 'Sign-up was rejected.' },
	)
}

/** Creates the enumeration-safe login rejection. */
export const rejectPasswordCredentials = (): never => {
	throw new PluginError(
		passwordAuthErrorCodes.invalidCredentials,
		'Password Auth credentials were rejected.',
		{ publicMessage: 'Invalid credentials.' },
	)
}

/** Creates the uniform invalid, expired, revoked, or stale session rejection. */
export const rejectPasswordSession = (): never => {
	throw new PluginError(
		passwordAuthErrorCodes.invalidSession,
		'Password Auth session was rejected.',
		{ publicMessage: 'Invalid session.' },
	)
}

/** Retains the operation union without widening handler declarations. */
export type PasswordAuthOperationDefinition = PluginOperationDefinition<
	PasswordAuthOperation['name'],
	'1.0.0',
	'application'
>
