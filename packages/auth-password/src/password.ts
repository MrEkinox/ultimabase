import {
	defineAuthMethod,
	type AuthEmailFields,
	type AuthenticationResult,
	type AuthMethod,
	type AuthPendingSignUp,
	type AuthMethodStaticsHKT,
} from '@ultimabase/auth-plugin'
import {
	FrameworkError,
	stringField,
	type CreateInput,
	type ScalarFieldTypeState,
	type SchemaDefinition,
	type StringField,
	type UniqueFieldCarrier,
} from '@ultimabase/core'
import { definePluginOptionsParser } from '@ultimabase/plugin-kit'
import { immutableRecord } from '@ultimabase/shared'

import {
	createCredentialCollection,
	type CredentialCollection,
} from './credentials.js'
import { createPasswordEmailHandlers } from './email-handlers.js'
import {
	createPasswordEmailStatics,
	passwordEmailGraphqlBindings,
	passwordEmailPublicOperations,
	passwordEmailRoutes,
	type PasswordEmailUserStatics,
} from './email-method.js'
import type { PasswordEmailOperationDefinition } from './email-operations.js'
import {
	resolvePasswordEmailOptions,
	type PasswordEmailChangeOptions,
	type PasswordResetOptions,
	type PasswordVerificationOptions,
} from './email-options.js'
import {
	createPasswordHandlers,
	deletePasswordCredential,
	passwordMethodName,
	type PasswordIdentifier,
} from './handlers.js'
import { normalizeEmail, normalizeUsername } from './normalization.js'
import {
	passwordErrorCodes,
	passwordOperations,
	type PasswordChangeInput,
	type PasswordChangeResult,
	type PasswordLoginInput,
	type PasswordOperationDefinition,
	type PasswordReauthenticateInput,
	type PasswordReauthenticateResult,
	type PasswordSignUpData,
} from './operations.js'
import { assertPasswordHashEngineAvailable } from './password-hasher.js'
import {
	resolvePasswordHashPolicy,
	type PasswordHashPolicyOptions,
} from './password-policy.js'
import { defaultUndefinedOptions } from './policy-options.js'
import {
	createPasswordGraphqlBindings,
	createPasswordPublicOperations,
	createPasswordRoutes,
} from './password-transports.js'

/** Configures `password()`. */
export interface PasswordOptions<
	TIdentifier extends PasswordIdentifier = PasswordIdentifier,
	TRequireVerifiedEmail extends boolean = boolean,
> {
	/**
	 * The User field users log in with; `email` adds a unique, normalized,
	 * format-validated email field.
	 * @default "username"
	 */
	readonly identifier?: TIdentifier
	/** Argon2id parameters and their monotonic `policyVersion`. */
	readonly policy?: PasswordHashPolicyOptions
	/**
	 * Enables `requestPasswordReset` and `resetPassword` (identifier `email`).
	 * @example `reset: { sendResetEmail: ({ email, token }) => mailer.sendReset(email, token) }`
	 */
	readonly reset?: EmailOnly<TIdentifier, PasswordResetOptions>
	/**
	 * Enables `requestEmailVerification`, `verifyEmail`, the email sent at
	 * sign-up and `requireVerifiedEmail` (identifier `email`).
	 * @example `verification: { sendVerificationEmail: ({ email, token }) => mailer.sendVerify(email, token) }`
	 */
	readonly verification?: EmailOnly<
		TIdentifier,
		PasswordVerificationOptions<TRequireVerifiedEmail>
	>
	/**
	 * Enables `requestEmailChange` and `confirmEmailChange` (identifier `email`).
	 * @example `emailChange: { sendConfirmationEmail, sendNoticeEmail }`
	 */
	readonly emailChange?: EmailOnly<TIdentifier, PasswordEmailChangeOptions>
}

/** An option only `identifier: 'email'` accepts. */
type EmailOnly<TIdentifier, TOptions> = [TIdentifier] extends ['email']
	? TOptions
	: never

/** Whether one identifier is the email: it adds the email flows. */
type IsEmail<TIdentifier> = [TIdentifier] extends ['email'] ? true : false

/**
 * The identifier field the method adds to the User schema; unique, so a
 * unique target of `updateOne` and `deleteOne` (ADR-0332).
 */
export type PasswordIdentifierField = StringField<
	ScalarFieldTypeState<true, false, true, false>
> &
	UniqueFieldCarrier

/**
 * The User fields of a password method: `username`, or with `email` the
 * foundation's `email`, `emailVerified` and `emailVerifiedAt`, which no
 * create or update input accepts.
 */
export type PasswordUserFields<TIdentifier extends PasswordIdentifier> =
	IsEmail<TIdentifier> extends true
		? AuthEmailFields
		: Readonly<Record<TIdentifier, PasswordIdentifierField>>

/** Login credentials of a password method. */
export type PasswordCredentials<TIdentifier extends PasswordIdentifier> =
	Readonly<Record<TIdentifier | 'password', string>>

/**
 * Sign-up data: the User's create fields and the password, plus the email
 * with `identifier: 'email'` (the email is not a create field).
 */
export type PasswordSignUpInput<
	TSchema,
	TIdentifier extends PasswordIdentifier = 'username',
> = CreateInput<TSchema> &
	(IsEmail<TIdentifier> extends true
		? { readonly email: string; readonly password: string }
		: { readonly password: string })

/**
 * What `signUp` returns: a session, or with `requireVerifiedEmail` the
 * profile and `verificationRequired: true` without a session.
 */
export type PasswordSignUpOutcome<
	TSchema extends SchemaDefinition,
	TRequireVerifiedEmail extends boolean,
> = TRequireVerifiedEmail extends true
	? AuthPendingSignUp<TSchema>
	: AuthenticationResult<TSchema>

/** Static members a password method adds to the User class. */
export interface PasswordUserStatics<
	TIdentifier extends PasswordIdentifier,
	TSchema extends SchemaDefinition,
	TRequireVerifiedEmail extends boolean = false,
> {
	/**
	 * Creates the User and its credential atomically, with a session; with
	 * `requireVerifiedEmail`, without a session until the email is verified.
	 * @example `await TodoUser.signUp({ email, password, displayName: 'Ada' })`
	 */
	signUp(
		input: PasswordSignUpInput<TSchema, TIdentifier>,
	): Promise<PasswordSignUpOutcome<TSchema, TRequireVerifiedEmail>>
	/**
	 * Checks the credentials and returns the readable User and a new session.
	 * @example `await TodoUser.login({ email, password })`
	 */
	login(
		input: PasswordCredentials<TIdentifier>,
	): Promise<AuthenticationResult<TSchema>>
	/**
	 * Replaces the password of the authenticated user; revokes the other
	 * sessions unless `revokeOnPasswordChange` is off.
	 * @example `await TodoUser.changePassword({ currentPassword, newPassword })`
	 */
	changePassword(input: PasswordChangeInput): Promise<PasswordChangeResult>
	/**
	 * Proves the password again, allowing sensitive operations such as
	 * `deleteAccount` for a few minutes.
	 * @example `await TodoUser.reauthenticate({ password })`
	 */
	reauthenticate(
		input: PasswordReauthenticateInput,
	): Promise<PasswordReauthenticateResult>
}

/** Adds the password members to the User class. */
export interface PasswordStatics<
	TIdentifier extends PasswordIdentifier,
	TRequireVerifiedEmail extends boolean = false,
> extends AuthMethodStaticsHKT {
	readonly statics: PasswordUserStatics<
		TIdentifier,
		Extract<this['schema'], SchemaDefinition>,
		TRequireVerifiedEmail
	> &
		(IsEmail<TIdentifier> extends true ? PasswordEmailUserStatics : unknown)
}

/** One password method. */
export type PasswordMethod<
	TIdentifier extends PasswordIdentifier,
	TRequireVerifiedEmail extends boolean = false,
> = AuthMethod<
	'password',
	PasswordUserFields<TIdentifier>,
	PasswordStatics<TIdentifier, TRequireVerifiedEmail>,
	| PasswordOperationDefinition
	| (IsEmail<TIdentifier> extends true
			? PasswordEmailOperationDefinition
			: never)
>

const parseOptions: (value: unknown) => Readonly<PasswordOptions> =
	definePluginOptionsParser({
		name: 'password options',
		keys: [
			'emailChange',
			'identifier',
			'policy',
			'reset',
			'verification',
		] as const,
		formatUnknownKey: (key) =>
			`password contains unknown option: ${String(key)}`,
		// The policy is validated by its own resolver below.
		normalize: (options) => options as PasswordOptions,
	})

const readIdentifier = (value: unknown): PasswordIdentifier => {
	if (value === undefined) return 'username'
	if (value !== 'username' && value !== 'email') {
		throw new TypeError("password identifier must be 'username' or 'email'")
	}
	return value
}

const invalidIdentifier = (identifier: string, message: string): never => {
	throw new FrameworkError('VALIDATION_ERROR', message, {
		publicMessage: 'The operation input is invalid.',
		publicDetails: {
			issues: [{ code: 'field.format', message, path: [identifier] }],
		},
	})
}

/**
 * The password sign-in method (ADR-0326): Argon2id verifiers in private
 * storage, login by `username` or `email`.
 *
 * @example `authPlugin({ methods: [password({ identifier: 'email' })] })`
 */
export const password = <
	const TIdentifier extends PasswordIdentifier = 'username',
	const TRequireVerifiedEmail extends boolean = false,
>(
	options?: PasswordOptions<TIdentifier, TRequireVerifiedEmail>,
	// `NoInfer`: the `methods` list must not infer the identifier from the
	// method type it expects, which would make it `never`.
): PasswordMethod<NoInfer<TIdentifier>, NoInfer<TRequireVerifiedEmail>> => {
	const untrusted = parseOptions(defaultUndefinedOptions(options))
	assertPasswordHashEngineAvailable()
	const identifier = readIdentifier(untrusted.identifier)
	const policy = resolvePasswordHashPolicy(untrusted.policy)
	const email = resolvePasswordEmailOptions({
		emailChange: untrusted.emailChange,
		identifier,
		reset: untrusted.reset,
		verification: untrusted.verification,
	})
	const ownsEmail = identifier === 'email'
	const requireVerifiedEmail = email.verification?.requireVerifiedEmail === true
	const normalizeIdentifier =
		identifier === 'email' ? normalizeEmail : normalizeUsername
	let credentials: CredentialCollection | undefined
	const requireCredentials = (): CredentialCollection => {
		if (credentials === undefined) {
			throw new TypeError('password credentials are not declared yet')
		}
		return credentials
	}
	return defineAuthMethod<
		'password',
		PasswordUserFields<TIdentifier>,
		PasswordStatics<TIdentifier, TRequireVerifiedEmail>,
		PasswordOperationDefinition
	>({
		name: passwordMethodName,
		environment: ['environment:native-code'],
		// With `email`, the foundation adds and protects the email fields.
		userFields: () =>
			ownsEmail
				? {}
				: {
						[identifier]: stringField({
							immutable: true,
							indexed: 'unique',
							required: true,
						}),
					},
		userEmail: ownsEmail,
		requireVerifiedEmail,
		checkUserData: (data) => {
			if (ownsEmail) return
			const value = data[identifier]
			let normalized: string | undefined
			try {
				normalized = normalizeIdentifier(value)
			} catch (error: unknown) {
				invalidIdentifier(
					identifier,
					error instanceof TypeError
						? error.message
						: `${identifier} is invalid`,
				)
			}
			if (normalized !== value) {
				invalidIdentifier(
					identifier,
					`${identifier} must use its normalized form`,
				)
			}
		},
		collections: (user) => {
			credentials ??= createCredentialCollection(user, policy)
			return [credentials]
		},
		contributions: (services) => {
			const emailHandlers = ownsEmail
				? createPasswordEmailHandlers({
						credentials: requireCredentials,
						email,
						policy,
						publicOperations: passwordEmailPublicOperations,
						services,
					})
				: undefined
			return [
				...createPasswordHandlers({
					afterSignUp: emailHandlers?.afterSignUp,
					beforeLogin: emailHandlers?.beforeLogin,
					credentials: requireCredentials,
					identifier,
					normalizeIdentifier,
					policy,
					publicOperations: createPasswordPublicOperations(
						identifier,
						requireVerifiedEmail,
					),
					requireVerifiedEmail,
					services,
				}),
				...(emailHandlers?.contributions ?? []),
				...(ownsEmail ? passwordEmailGraphqlBindings : []),
				...createPasswordGraphqlBindings(identifier, requireVerifiedEmail),
			]
		},
		routes: [
			...createPasswordRoutes(requireVerifiedEmail),
			...(ownsEmail ? passwordEmailRoutes : []),
		],
		errorStatuses: {
			[passwordErrorCodes.emailChangeRejected]: 400,
			[passwordErrorCodes.passwordChangeRejected]: 400,
		},
		statics: (services) =>
			immutableRecord({
				...(ownsEmail ? createPasswordEmailStatics(services) : {}),
				signUp: (input: PasswordSignUpData) =>
					services.execute(passwordOperations.signUp, input),
				login: (input: PasswordLoginInput) =>
					services.execute(passwordOperations.login, input),
				changePassword: (input: PasswordChangeInput) =>
					services.execute(passwordOperations.changePassword, input),
				reauthenticate: (input: PasswordReauthenticateInput) =>
					services.execute(passwordOperations.reauthenticate, input),
			}),
		unlink: (userId) => deletePasswordCredential(requireCredentials(), userId),
	})
}
