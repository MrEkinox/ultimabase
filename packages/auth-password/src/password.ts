import {
	authGraphqlBinding,
	authPayloadTypes,
	defineAuthMethod,
	graphqlField,
	graphqlObjectType,
	toAuthPayload,
	type AuthEmailVerificationFields,
	type AuthenticationResult,
	type AuthMethod,
	type AuthMethodStaticsHKT,
} from '@ultimabase/auth-plugin'
import {
	FrameworkError,
	stringField,
	type CreateInput,
	type ScalarFieldTypegenState,
	type SchemaDefinition,
	type StringField,
} from '@ultimabase/core'
import type { PluginOperationPublicDeclaration } from '@ultimabase/core/plugin'
import { definePluginOptionsParser } from '@ultimabase/plugin-kit'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

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

/** Configures `password()`. */
export interface PasswordOptions<
	TIdentifier extends PasswordIdentifier = PasswordIdentifier,
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
	readonly verification?: EmailOnly<TIdentifier, PasswordVerificationOptions>
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

/** The identifier field the method adds to the User schema. */
export type PasswordIdentifierField = StringField<
	ScalarFieldTypegenState<true, false, true, false>
>

/**
 * The User fields of a password method: the identifier, and with `email`
 * the foundation's `emailVerified` and `emailVerifiedAt`.
 */
export type PasswordUserFields<TIdentifier extends PasswordIdentifier> =
	Readonly<Record<TIdentifier, PasswordIdentifierField>> &
		(IsEmail<TIdentifier> extends true ? AuthEmailVerificationFields : unknown)

/** Login credentials of a password method. */
export type PasswordCredentials<TIdentifier extends PasswordIdentifier> =
	Readonly<Record<TIdentifier | 'password', string>>

/** Sign-up data: the User's create fields and the password. */
export type PasswordSignUpInput<TSchema> = CreateInput<TSchema> & {
	readonly password: string
}

/** Static members a password method adds to the User class. */
export interface PasswordUserStatics<
	TIdentifier extends PasswordIdentifier,
	TSchema extends SchemaDefinition,
> {
	/**
	 * Creates the User, its credential and a session atomically.
	 * @example `await TodoUser.signUp({ email, password, displayName: 'Ada' })`
	 */
	signUp(
		input: PasswordSignUpInput<TSchema>,
	): Promise<AuthenticationResult<TSchema>>
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
> extends AuthMethodStaticsHKT {
	readonly statics: PasswordUserStatics<
		TIdentifier,
		Extract<this['schema'], SchemaDefinition>
	> &
		(IsEmail<TIdentifier> extends true ? PasswordEmailUserStatics : unknown)
}

/** One password method. */
export type PasswordMethod<TIdentifier extends PasswordIdentifier> = AuthMethod<
	'password',
	PasswordUserFields<TIdentifier>,
	PasswordStatics<TIdentifier>,
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

const stringSchema = immutableRecord({ type: 'string' })
const objectSchema = (names: readonly string[]) =>
	immutableRecord({
		type: 'object',
		properties: immutableRecord(
			Object.fromEntries(names.map((name) => [name, stringSchema])),
		),
		required: immutableArray(names),
		additionalProperties: false,
	})

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
>(
	options?: PasswordOptions<TIdentifier>,
	// `NoInfer`: the `methods` list must not infer the identifier from the
	// method type it expects, which would make it `never`.
): PasswordMethod<NoInfer<TIdentifier>> => {
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
	const normalizeIdentifier =
		identifier === 'email' ? normalizeEmail : normalizeUsername
	let credentials: CredentialCollection | undefined
	const requireCredentials = (): CredentialCollection => {
		if (credentials === undefined) {
			throw new TypeError('password credentials are not declared yet')
		}
		return credentials
	}
	const publicOperations: Readonly<
		Record<keyof typeof passwordOperations, PluginOperationPublicDeclaration>
	> = immutableRecord({
		changePassword: immutableRecord({
			name: 'changePassword',
			input: objectSchema(['currentPassword', 'newPassword']),
		}),
		login: immutableRecord({
			name: 'login',
			input: objectSchema([identifier, 'password']),
		}),
		reauthenticate: immutableRecord({
			name: 'reauthenticate',
			input: objectSchema(['password']),
		}),
		signUp: immutableRecord({ name: 'signUp' }),
	})
	const loginType = graphqlObjectType('input-object', 'PasswordLoginInput', [
		graphqlField(identifier, 'String'),
		graphqlField('password', 'String'),
	])
	return defineAuthMethod<
		'password',
		PasswordUserFields<TIdentifier>,
		PasswordStatics<TIdentifier>,
		PasswordOperationDefinition
	>({
		name: passwordMethodName,
		environment: ['environment:native-code'],
		userFields: () => ({
			// Only `confirmEmailChange` changes an email: the foundation guards it.
			[identifier]: stringField({
				immutable: !ownsEmail,
				indexed: 'unique',
				required: true,
			}),
		}),
		userEmail: ownsEmail,
		checkUserData: (data) => {
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
					publicOperations,
					services,
				}),
				...(emailHandlers?.contributions ?? []),
				...(ownsEmail ? passwordEmailGraphqlBindings : []),
				authGraphqlBinding({
					encode: toAuthPayload,
					field: 'signUp',
					input: 'PasswordSignUpInput',
					operation: passwordOperations.signUp,
					result: 'AuthPayload',
					root: 'mutation',
					types: [
						graphqlObjectType(
							'input-object',
							'PasswordSignUpInput',
							[graphqlField('password', 'String')],
							true,
						),
						...authPayloadTypes,
					],
				}),
				authGraphqlBinding({
					encode: toAuthPayload,
					field: 'login',
					input: 'PasswordLoginInput',
					operation: passwordOperations.login,
					result: 'AuthPayload',
					root: 'mutation',
					types: [loginType, ...authPayloadTypes],
				}),
				authGraphqlBinding({
					field: 'changePassword',
					input: 'PasswordChangeInput',
					operation: passwordOperations.changePassword,
					result: 'PasswordChangePayload',
					root: 'mutation',
					types: [
						graphqlObjectType('input-object', 'PasswordChangeInput', [
							graphqlField('currentPassword', 'String'),
							graphqlField('newPassword', 'String'),
						]),
						graphqlObjectType('object', 'PasswordChangePayload', [
							graphqlField('changed', 'Boolean'),
						]),
					],
				}),
				authGraphqlBinding({
					field: 'reauthenticate',
					input: 'PasswordReauthenticateInput',
					operation: passwordOperations.reauthenticate,
					result: 'PasswordReauthenticatePayload',
					root: 'mutation',
					types: [
						graphqlObjectType('input-object', 'PasswordReauthenticateInput', [
							graphqlField('password', 'String'),
						]),
						graphqlObjectType('object', 'PasswordReauthenticatePayload', [
							graphqlField('reauthenticated', 'Boolean'),
						]),
					],
				}),
			]
		},
		routes: [
			{
				body: 'json',
				operation: passwordOperations.signUp,
				path: 'sign-up',
				response: 'session',
			},
			{
				body: 'json',
				operation: passwordOperations.login,
				path: 'login',
				response: 'session',
			},
			{
				body: 'json',
				operation: passwordOperations.changePassword,
				path: 'change-password',
				response: 'result',
			},
			{
				body: 'json',
				operation: passwordOperations.reauthenticate,
				path: 'reauthenticate',
				response: 'result',
			},
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
