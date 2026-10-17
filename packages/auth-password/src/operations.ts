import {
	authErrorCodes,
	authenticationResult,
	snapshotSignUpInput,
	type AuthenticationResult,
	type AuthPendingSignUp,
} from '@ultimabase/auth-plugin'
import { PluginError, type SchemaDefinition } from '@ultimabase/core'
import {
	defineOperation,
	defineOperationValue,
	type PluginOperationDefinition,
	type PluginOperationValueContract,
} from '@ultimabase/core/plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

/** Login credentials: the configured identifier and the password. */
export type PasswordLoginInput =
	| Readonly<{ email: string; password: string }>
	| Readonly<{ password: string; username: string }>

/** Replaces the password of the authenticated user. */
export interface PasswordChangeInput {
	readonly currentPassword: string
	readonly newPassword: string
}

/** Proves the password again before a sensitive operation. */
export interface PasswordReauthenticateInput {
	readonly password: string
}

/** Acknowledges a changed password. */
export interface PasswordChangeResult {
	readonly changed: true
}

/** Acknowledges a new proof of the password. */
export interface PasswordReauthenticateResult {
	readonly reauthenticated: true
}

/** The public failures of the password method, beside the foundation's. */
export const passwordErrorCodes: Readonly<{
	readonly emailChangeRejected: 'AUTH_EMAIL_CHANGE_REJECTED'
	readonly passwordChangeRejected: 'AUTH_PASSWORD_CHANGE_REJECTED'
}> = immutableRecord({
	emailChangeRejected: 'AUTH_EMAIL_CHANGE_REJECTED',
	passwordChangeRejected: 'AUTH_PASSWORD_CHANGE_REJECTED',
} as const)

/** Rejects a password change without telling which secret failed. */
export const rejectPasswordChange = (): never => {
	throw new PluginError(
		passwordErrorCodes.passwordChangeRejected,
		'The password change was rejected.',
		{ publicMessage: 'Password change was rejected.' },
	)
}

/**
 * Rejects an email change without telling which part failed: the password,
 * the new address, or an address taken at confirmation.
 */
export const rejectEmailChange = (cause?: unknown): never => {
	throw new PluginError(
		passwordErrorCodes.emailChangeRejected,
		'The email change was rejected.',
		{
			publicMessage: 'Email change was rejected.',
			...(cause === undefined ? {} : { cause }),
		},
	)
}

const loginInput = defineOperationValue<PasswordLoginInput>((value, path) => {
	const identifier =
		isPlainRecord(value) && Object.hasOwn(value, 'email') ? 'email' : 'username'
	if (
		!isPlainRecord(value) ||
		Object.keys(value).length !== 2 ||
		typeof value.password !== 'string' ||
		typeof value[identifier] !== 'string'
	) {
		throw new TypeError(
			`${path} must contain exactly an identifier and password`,
		)
	}
	return immutableRecord({
		[identifier]: value[identifier],
		password: value.password,
	}) as PasswordLoginInput
})

/** @internal One input with exactly the given string fields. */
export const exactStrings = <TValue>(
	names: readonly string[],
): PluginOperationValueContract<TValue> =>
	defineOperationValue<TValue>((value, path) => {
		if (
			!isPlainRecord(value) ||
			Object.keys(value).length !== names.length ||
			names.some((name) => typeof value[name] !== 'string')
		) {
			throw new TypeError(`${path} must contain exactly ${names.join(', ')}`)
		}
		return immutableRecord(
			Object.fromEntries(names.map((name) => [name, value[name]])),
		) as TValue
	})

/** @internal One acknowledgement such as `{ changed: true }`. */
export const acknowledgement = <TValue>(
	key: string,
): PluginOperationValueContract<TValue> =>
	defineOperationValue<TValue>((value, path) => {
		if (
			!isPlainRecord(value) ||
			Object.keys(value).length !== 1 ||
			value[key] !== true
		) {
			throw new TypeError(`${path} must be { ${key}: true }`)
		}
		return immutableRecord({ [key]: true }) as TValue
	})

/** The sign-up input: the User's create fields, the identifier and `password`. */
export type PasswordSignUpData = Readonly<Record<string, unknown>> &
	Readonly<{ password: string }>

const signUpInput = defineOperationValue<PasswordSignUpData>(
	(value, path) =>
		snapshotSignUpInput(value, path, ['password']) as PasswordSignUpData,
)

/** @internal One operation of the password method. */
export type PasswordOperation<
	TName extends string,
	TInput,
	TResult,
	TErrors extends readonly string[],
> = PluginOperationDefinition<
	`ultimabase.auth.password.${TName}`,
	'1.0.0',
	'application',
	TInput,
	TResult,
	TErrors
>

// Hashing stays outside transactions: each handler opens a short one after.
/** @internal Defines one operation of the password method. */
export const passwordOperation = <
	const TName extends string,
	TInput,
	TResult,
	const TErrors extends readonly string[],
>(
	name: TName,
	input: PluginOperationValueContract<TInput>,
	result: PluginOperationValueContract<TResult>,
	errors: TErrors,
): PasswordOperation<TName, TInput, TResult, TErrors> =>
	defineOperation({
		errors,
		input,
		name: `ultimabase.auth.password.${name}`,
		result,
		target: 'application',
		transaction: 'forbidden',
		version: '1.0.0',
	})

/**
 * The sign-up result: a session, or with `requireVerifiedEmail` the profile
 * and `verificationRequired: true` without a session.
 */
export type PasswordSignUpResult<
	TUser extends SchemaDefinition = SchemaDefinition,
> = AuthenticationResult<TUser> | AuthPendingSignUp<TUser>

const signUpResult = defineOperationValue<PasswordSignUpResult>(
	(value, path) => {
		if (!isPlainRecord(value) || value.verificationRequired !== true) {
			return authenticationResult.snapshot(value, path)
		}
		if (
			Object.keys(value).length !== 2 ||
			!isPlainRecord(value.user) ||
			!Object.isFrozen(value.user) ||
			typeof value.user.id !== 'string'
		) {
			throw new TypeError(`${path} must be a pending sign-up`)
		}
		const pending: AuthPendingSignUp = immutableRecord({
			user: value.user,
			verificationRequired: true as const,
		}) as AuthPendingSignUp
		return pending
	},
)

const signUpOperation: PasswordOperation<
	'sign-up',
	PasswordSignUpData,
	PasswordSignUpResult,
	readonly ['AUTH_SIGN_UP_REJECTED', 'AUTH_USER_NOT_READABLE']
> = passwordOperation('sign-up', signUpInput, signUpResult, [
	authErrorCodes.signUpRejected,
	authErrorCodes.userNotReadable,
])
const loginOperation: PasswordOperation<
	'login',
	PasswordLoginInput,
	AuthenticationResult,
	readonly [
		'AUTH_EMAIL_NOT_VERIFIED',
		'AUTH_INVALID_CREDENTIALS',
		'AUTH_TOO_MANY_ATTEMPTS',
		'AUTH_USER_NOT_READABLE',
	]
> = passwordOperation('login', loginInput, authenticationResult, [
	authErrorCodes.emailNotVerified,
	authErrorCodes.invalidCredentials,
	authErrorCodes.tooManyAttempts,
	authErrorCodes.userNotReadable,
])
const changePasswordOperation: PasswordOperation<
	'change-password',
	PasswordChangeInput,
	PasswordChangeResult,
	readonly [
		'AUTH_INVALID_SESSION',
		'AUTH_PASSWORD_CHANGE_REJECTED',
		'AUTH_TOO_MANY_ATTEMPTS',
	]
> = passwordOperation(
	'change-password',
	exactStrings<PasswordChangeInput>(['currentPassword', 'newPassword']),
	acknowledgement<PasswordChangeResult>('changed'),
	[
		authErrorCodes.invalidSession,
		passwordErrorCodes.passwordChangeRejected,
		authErrorCodes.tooManyAttempts,
	],
)
const reauthenticateOperation: PasswordOperation<
	'reauthenticate',
	PasswordReauthenticateInput,
	PasswordReauthenticateResult,
	readonly [
		'AUTH_INVALID_CREDENTIALS',
		'AUTH_INVALID_SESSION',
		'AUTH_TOO_MANY_ATTEMPTS',
	]
> = passwordOperation(
	'reauthenticate',
	exactStrings<PasswordReauthenticateInput>(['password']),
	acknowledgement<PasswordReauthenticateResult>('reauthenticated'),
	[
		authErrorCodes.invalidCredentials,
		authErrorCodes.invalidSession,
		authErrorCodes.tooManyAttempts,
	],
)

// The `typeof` members keep hovers on the named private constants.
/**
 * The password method's operations, all public (ADR-0324) and served under
 * `/api/auth` and in GraphQL only (ADR-0341);
 * `graphqlPlugin({ hide: [passwordOperations.changePassword] })` hides one.
 */
export const passwordOperations: Readonly<{
	readonly changePassword: typeof changePasswordOperation
	readonly login: typeof loginOperation
	readonly reauthenticate: typeof reauthenticateOperation
	readonly signUp: typeof signUpOperation
}> = immutableRecord({
	changePassword: changePasswordOperation,
	login: loginOperation,
	reauthenticate: reauthenticateOperation,
	signUp: signUpOperation,
})

/** One operation of the password method. */
export type PasswordOperationDefinition =
	(typeof passwordOperations)[keyof typeof passwordOperations]
