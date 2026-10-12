import type {
	GenericField,
	PrivateCollection,
	SchemaDefinition,
	SchemaReference,
} from '@ultimabase/core'
import type {
	PluginContribution,
	PluginEnvironmentClaim,
	PluginOperationDefinition,
	PluginOperationInput,
	PluginOperationResult,
	RequestContext,
} from '@ultimabase/core/plugin'
import { assertNonEmptyString, isPlainRecord } from '@ultimabase/shared'

import type { AuthMethodInfo, LinkedAccountInput } from './accounts.js'
import type { AttemptSubject } from './attempts.js'
import type { AuthUserRecord } from './email.js'
import type { AuthHttpRoute } from './http-transport.js'
import type { AuthPrincipal } from './principal.js'
import type {
	AuthClient,
	AuthenticationResult,
	AuthSession,
} from './session.js'
import type { ResolvedAuthSessionPolicy } from './session-policy.js'
import type {
	AuthIssuedToken,
	AuthTokenClaim,
	AuthTokenPurpose,
} from './tokens.js'

/**
 * Higher-kinded slot through which a method adds static members to the User
 * class: the foundation substitutes `schema`, the class, and reads `statics`.
 *
 * @example
 * ```ts
 * interface MagicLinkStatics extends AuthMethodStaticsHKT {
 *   readonly statics: { sendMagicLink(input: { email: string }): Promise<void> }
 * }
 * ```
 */
export interface AuthMethodStaticsHKT {
	readonly schema: unknown
	readonly statics: unknown
}

declare const authMethodTypes: unique symbol

/**
 * One sign-in method given to `authPlugin({ methods })`, such as
 * `password()`. Methods depend on the foundation, never on each other.
 */
export interface AuthMethod<
	TName extends string = string,
	TUserFields extends object = object,
	TStatics extends AuthMethodStaticsHKT = AuthMethodStaticsHKT,
	TOperation extends PluginOperationDefinition = PluginOperationDefinition,
> {
	readonly kind: 'auth-method'
	/** The method name, stored on linked accounts and sessions. */
	readonly name: TName
	readonly [authMethodTypes]?: Readonly<{
		readonly fields: TUserFields
		readonly operation: TOperation
		readonly statics: TStatics
	}>
}

type MethodTypes<TMethod> = TMethod extends {
	readonly [authMethodTypes]?: infer TTypes
}
	? NonNullable<TTypes>
	: never

type MethodFields<TMethod> =
	MethodTypes<TMethod> extends { readonly fields: infer TFields }
		? TFields
		: unknown
type MethodOperation<TMethod> =
	MethodTypes<TMethod> extends { readonly operation: infer TOperation }
		? Extract<TOperation, PluginOperationDefinition>
		: never
type MethodStaticsSlot<TMethod> =
	MethodTypes<TMethod> extends { readonly statics: infer TStatics }
		? TStatics
		: unknown

/** The User fields every installed method adds. */
export type AuthMethodUserFields<TMethods> = TMethods extends readonly [
	infer TFirst,
	...infer TRest,
]
	? MethodFields<TFirst> & AuthMethodUserFields<TRest>
	: unknown

/** The operations every installed method contributes. */
export type AuthMethodOperation<TMethods> = TMethods extends readonly [
	infer TFirst,
	...infer TRest,
]
	? MethodOperation<TFirst> | AuthMethodOperation<TRest>
	: never

type ApplyStatics<TStatics, TSchema> = TStatics extends AuthMethodStaticsHKT
	? (TStatics & { readonly schema: TSchema })['statics']
	: unknown

/** The User static members every installed method adds to one class. */
export type AuthMethodStatics<TMethods, TSchema> = TMethods extends readonly [
	infer TFirst,
	...infer TRest,
]
	? ApplyStatics<MethodStaticsSlot<TFirst>, TSchema> &
			AuthMethodStatics<TRest, TSchema>
	: unknown

/** The authenticated identity of a request, as method handlers read it. */
export interface AuthenticatedRequest {
	readonly principal: AuthPrincipal
	readonly session: AuthSession
	readonly userId: string
}

/**
 * Services the foundation gives a method's operation handlers. They run in
 * the handler's request; mutations belong in a transaction.
 */
export interface AuthServices {
	/** The application's User schema, known once the application is configured. */
	user(): SchemaReference<string>
	/** The validated session policy of `authPlugin({ session })`. */
	readonly sessionPolicy: ResolvedAuthSessionPolicy
	/** The HTTP client of the request, `undefined` outside HTTP. */
	client(context: RequestContext): AuthClient | undefined
	/**
	 * Creates one User through the ordinary pipeline with the plugin's own
	 * elevation, naming invalid fields in `AUTH_SIGN_UP_REJECTED`.
	 */
	createUser(
		data: Readonly<Record<string, unknown>>,
		context: RequestContext,
	): Promise<string>
	/** Links one method account to a user. */
	linkAccount(
		userId: string,
		account: LinkedAccountInput,
	): Promise<AuthMethodInfo>
	/** Finds the user linked to one method account. */
	findLinkedUser(
		method: string,
		providerUserId: string,
	): Promise<string | undefined>
	/**
	 * Signs in an external account: its linked user, else (with `linking:
	 * 'verified-email'`) the one user who verified the same email, else a new
	 * user from `createUser`. Runs in the current transaction.
	 */
	authenticateAccount(options: {
		readonly account: LinkedAccountInput
		readonly context: RequestContext
		readonly createUser: () => Promise<string>
	}): Promise<AuthenticationResult>
	/**
	 * Issues a session, resets the subject's attempts, emits `afterSignUp` or
	 * `afterLogin` and reads the profile. Runs in the current transaction.
	 */
	signIn(options: {
		readonly context: RequestContext
		readonly method: string
		readonly signUp?: boolean
		readonly subject?: AttemptSubject
		readonly userId: string
	}): Promise<AuthenticationResult>
	/** Reads the authenticated request, else rejects with `AUTH_INVALID_SESSION`. */
	requireAuthenticated(context: RequestContext): AuthenticatedRequest
	/** Rejects with `AUTH_REAUTHENTICATION_REQUIRED` unless the login is recent. */
	requireRecentAuthentication(context: RequestContext): void
	/** Records a new proof of credentials on the current session. */
	markAuthenticated(context: RequestContext): Promise<void>
	/** Revokes the user's other sessions when `revokeOnPasswordChange` is on. */
	revokeOtherSessionsOnPasswordChange(context: RequestContext): Promise<void>
	/**
	 * Rejects with `AUTH_TOO_MANY_ATTEMPTS` (and emits `afterLoginFailed`)
	 * while the subject is locked. Opens its own transaction.
	 */
	assertAttemptAllowed(
		subject: AttemptSubject,
		context: RequestContext,
		transaction: <TResult>(work: () => Promise<TResult>) => Promise<TResult>,
	): Promise<void>
	/** Counts one failure and emits `afterLoginFailed`. Runs in the current transaction. */
	recordFailedAttempt(
		subject: AttemptSubject,
		context: RequestContext,
	): Promise<void>
	/** Resets the counters of the subject after a success. */
	resetAttempts(subject: AttemptSubject): Promise<void>
	/**
	 * Rejects with `AUTH_TOO_MANY_ATTEMPTS` while the subject is locked,
	 * without an event: for requests that are not logins, such as resets.
	 */
	checkAttempt(subject: AttemptSubject): Promise<void>
	/** Counts one attempt of the subject without an event. */
	countAttempt(subject: AttemptSubject): Promise<void>
	/**
	 * Issues one single-use token (32 random bytes, only its SHA-256 digest
	 * stored); it replaces the user's previous token of the same purpose.
	 * Runs in the current transaction.
	 */
	issueToken(options: {
		readonly email: string
		readonly expiresInMs: number
		readonly purpose: AuthTokenPurpose
		readonly userId: string
	}): Promise<AuthIssuedToken>
	/** Reads the account of a valid token without using it. */
	findToken(
		purpose: AuthTokenPurpose,
		token: unknown,
	): Promise<AuthTokenClaim | undefined>
	/** Cancels the user's current token of one purpose, if any. */
	cancelToken(userId: string, purpose: AuthTokenPurpose): Promise<void>
	/** Uses a valid token exactly once. Runs in the current transaction. */
	consumeToken(
		purpose: AuthTokenPurpose,
		token: unknown,
	): Promise<AuthTokenClaim | undefined>
	/** Reads one User row with the plugin's elevation, for application callbacks. */
	readUser(userId: string): Promise<AuthUserRecord | undefined>
	/**
	 * Marks the user's email verified while it still equals `email`, and its
	 * linked accounts; emits `afterEmailVerified`. Resolves whether it was
	 * newly verified. Runs in the current transaction.
	 */
	markEmailVerified(options: {
		readonly context: RequestContext
		readonly email: string
		readonly userId: string
	}): Promise<boolean>
	/**
	 * Replaces the user's email with a verified one and moves the method's
	 * linked account; emits `afterEmailChanged`. Resolves the previous email.
	 * A taken email fails with Core's `UNIQUE_VIOLATION`. Runs in the current
	 * transaction.
	 */
	changeEmail(options: {
		readonly context: RequestContext
		readonly email: string
		readonly method: string
		readonly userId: string
	}): Promise<string>
	/**
	 * Revokes every session of the user after a password reset and emits
	 * `afterPasswordReset`. Runs in the current transaction.
	 */
	completePasswordReset(userId: string, context: RequestContext): Promise<void>
}

/** What a method's static members use to reach the started application. */
export interface AuthStaticsServices {
	/** The User class the members belong to. */
	readonly schema: SchemaDefinition
	/** Executes one installed operation in the application that owns the class. */
	execute<const TOperation extends PluginOperationDefinition>(
		operation: TOperation,
		input: PluginOperationInput<TOperation>,
	): Promise<PluginOperationResult<TOperation>>
}

/** The runtime of one method, given to `defineAuthMethod`. */
export interface AuthMethodImplementation {
	/** The method name, such as `password`. */
	readonly name: string
	/** Claims the method's code makes, such as native code. */
	readonly environment?: readonly PluginEnvironmentClaim[]
	/** Creates the fields the method adds to the User schema. */
	readonly userFields?: () => Readonly<Record<string, GenericField>>
	/**
	 * Whether the method adds the User `email` field. The foundation then adds
	 * `emailVerified` and `emailVerifiedAt`, and only the authentication flows
	 * write the three of them.
	 */
	readonly userEmail?: boolean
	/** Checks the User data of every create and update, such as a canonical identifier. */
	readonly checkUserData?: (data: Readonly<Record<string, unknown>>) => void
	/** Declares the method's private collections once the User schema is known. */
	readonly collections?: (
		user: SchemaDefinition,
	) => readonly PrivateCollection[]
	/** Operations, bindings and other contributions, given the foundation's services. */
	readonly contributions: (
		services: AuthServices,
	) => readonly PluginContribution[]
	/** HTTP routes under the foundation's prefix, such as `login`. */
	readonly routes?: readonly AuthHttpRoute[]
	/** The HTTP status of each public failure the method declares. */
	readonly errorStatuses?: Readonly<Record<string, number>>
	/** Static members the method adds to the User class. */
	readonly statics?: (
		services: AuthStaticsServices,
	) => Readonly<Record<string, unknown>>
	/** Deletes the method's private secrets of a user whose account is unlinked. */
	readonly unlink?: (userId: string, context: RequestContext) => Promise<void>
}

const implementations = new WeakMap<object, AuthMethodImplementation>()
const implementationKeys = new Set([
	'checkUserData',
	'collections',
	'contributions',
	'environment',
	'errorStatuses',
	'name',
	'routes',
	'statics',
	'unlink',
	'userEmail',
	'userFields',
])

/**
 * Defines one sign-in method for `authPlugin({ methods })`. The type
 * arguments name the User fields, statics slot and operations it adds.
 *
 * @example `export const magicLink = () => defineAuthMethod<'magic-link'>({ name: 'magic-link', contributions })`
 */
export const defineAuthMethod = <
	const TName extends string,
	TUserFields extends object = Readonly<Record<never, never>>,
	TStatics extends AuthMethodStaticsHKT = AuthMethodStaticsHKT,
	TOperation extends PluginOperationDefinition = never,
>(
	implementation: AuthMethodImplementation & { readonly name: TName },
): AuthMethod<TName, TUserFields, TStatics, TOperation> => {
	const untrusted: unknown = implementation
	if (!isPlainRecord(untrusted)) {
		throw new TypeError('auth method must be a plain object')
	}
	for (const key of Object.keys(untrusted)) {
		if (!implementationKeys.has(key)) {
			throw new TypeError(`auth method contains unknown option: ${key}`)
		}
	}
	assertNonEmptyString(untrusted.name, 'auth method name')
	if (typeof untrusted.contributions !== 'function') {
		throw new TypeError('auth method contributions must be a function')
	}
	const method = Object.freeze({
		kind: 'auth-method' as const,
		name: implementation.name,
	})
	implementations.set(method, implementation)
	return method
}

/** Reads the runtime of a method created by `defineAuthMethod`. */
export const readAuthMethodImplementation = (
	method: unknown,
): AuthMethodImplementation => {
	const implementation =
		typeof method === 'object' && method !== null
			? implementations.get(method)
			: undefined
	if (implementation === undefined) {
		throw new TypeError(
			'authPlugin methods must be created by an auth method such as password()',
		)
	}
	return implementation
}
