import type {
	PrivateCollection,
	SchemaDefinition,
	SchemaReference,
} from '@ultimabase/core'
import type { RequestContext } from '@ultimabase/core/plugin'
import { immutableRecord } from '@ultimabase/shared'

import {
	changeLinkedEmail,
	findLinkedUserId,
	findUserByVerifiedEmail,
	insertLinkedAccount,
	verifyLinkedEmail,
	type AuthLinking,
} from './accounts.js'
import {
	assertAttemptAllowed,
	recordAttemptFailure,
	resetAttempts,
	type AttemptSubject,
} from './attempts.js'
import { createAuthCollections, type AuthCollections } from './collections.js'
import { readUserRecord, writeUserEmailFields } from './email.js'
import {
	authErrorCodes,
	rejectReauthentication,
	rejectSession,
} from './errors.js'
import type { AuthEventEmitter } from './events.js'
import type {
	AuthenticatedRequest,
	AuthMethodImplementation,
	AuthServices,
} from './method.js'
import { readAuthenticationResult } from './profile.js'
import { authClient, authPrincipal, authSession } from './session.js'
import type { ResolvedAuthSessionPolicy } from './session-policy.js'
import {
	advanceUserGeneration,
	issueSession,
	markSessionAuthenticated,
	revokeOtherSessions,
} from './sessions.js'
import {
	cancelAuthToken,
	consumeAuthToken,
	findAuthToken,
	issueAuthToken,
} from './tokens.js'
import { createUserElevated } from './user-creation.js'
import { PluginError } from '@ultimabase/core'

/**
 * The state of one plugin instance: the User schema the factory declared and
 * the private collections declared against it.
 */
export interface AuthState {
	collections: AuthCollections | undefined
	readonly methodCollections: Map<string, readonly PrivateCollection[]>
	/** The class name given to `App.UserSchema.define`. */
	userClassName: string | undefined
	/** The latest class of the User declaration chain: the registered one. */
	user: SchemaReference<string> | undefined
}

/** Reads the declared User schema. */
export const requireUser = (state: AuthState): SchemaReference<string> => {
	if (state.user === undefined) {
		throw new TypeError(
			'authPlugin needs one User schema: declare it with App.UserSchema.define({ className, fields }) and register it in schemas',
		)
	}
	return state.user
}

/** Declares the private collections once, against the declared User schema. */
export const prepareCollections = (
	state: AuthState,
	methods: readonly AuthMethodImplementation[],
): readonly PrivateCollection[] => {
	const user: SchemaDefinition = requireUser(state)
	state.collections ??= createAuthCollections(user)
	const { accounts, attempts, sessions, states, tokens, verifiedEmails } =
		state.collections
	const foundation: readonly PrivateCollection[] = [
		accounts,
		attempts,
		sessions,
		states,
		tokens,
		verifiedEmails,
	]
	const own = methods.flatMap((method) => {
		const existing = state.methodCollections.get(method.name)
		if (existing !== undefined) return existing
		const created = method.collections?.(user) ?? []
		state.methodCollections.set(method.name, created)
		return created
	})
	return [...foundation, ...own]
}

/** Reads the collections once the application declared them. */
export const requireCollections = (state: AuthState): AuthCollections => {
	if (state.collections === undefined) {
		throw new TypeError('authPlugin collections are not declared yet')
	}
	return state.collections
}

/** Reads the authenticated request, else rejects with `AUTH_INVALID_SESSION`. */
export const readAuthenticated = (
	state: AuthState,
	context: RequestContext,
): AuthenticatedRequest => {
	const principal = context.getValue(authPrincipal)
	const session = context.getValue(authSession)
	if (
		principal === undefined ||
		session === undefined ||
		!Object.is(principal.user.schema, state.user)
	) {
		return rejectSession()
	}
	return immutableRecord({ principal, session, userId: principal.user.id })
}

/** Creates the services one plugin instance gives its methods. */
export const createAuthServices = (options: {
	readonly emit: AuthEventEmitter
	readonly linking: AuthLinking
	readonly sessionPolicy: ResolvedAuthSessionPolicy
	readonly state: AuthState
}): AuthServices => {
	const { emit, linking, sessionPolicy, state } = options
	const collections = () => requireCollections(state)
	const subjectAddress = (subject: AttemptSubject | undefined) =>
		subject?.address ?? null
	const services: AuthServices = {
		user: () => requireUser(state),
		sessionPolicy,
		client: (context) => context.getValue(authClient),
		createUser: (data, context) =>
			createUserElevated(requireUser(state), data, context),
		linkAccount: (userId, account) =>
			insertLinkedAccount(collections(), userId, account),
		findLinkedUser: (method, providerUserId) =>
			findLinkedUserId(collections(), method, providerUserId),
		signIn: async ({ context, method, signUp = false, subject, userId }) => {
			if (subject !== undefined) {
				await resetAttempts(collections().attempts, subject)
			}
			const client = context.getValue(authClient)
			const session = await issueSession(collections(), {
				client,
				method,
				policy: sessionPolicy,
				userId,
			})
			emit(
				signUp ? 'afterSignUp' : 'afterLogin',
				{
					address: client?.address ?? subjectAddress(subject),
					method,
					sessionId: session.issued.id,
					userId,
				},
				context.requestId,
			)
			return readAuthenticationResult(
				requireUser(state),
				userId,
				session,
				context,
			)
		},
		authenticateAccount: async ({ account, context, createUser }) => {
			let userId = await findLinkedUserId(
				collections(),
				account.method,
				account.providerUserId,
			)
			let created = false
			if (userId === undefined) {
				if (
					linking === 'verified-email' &&
					account.emailVerified === true &&
					typeof account.email === 'string'
				) {
					userId = await findUserByVerifiedEmail(collections(), account.email)
				}
				if (userId === undefined) {
					userId = await createUser()
					created = true
				}
				await insertLinkedAccount(collections(), userId, account)
			}
			return services.signIn({
				context,
				method: account.method,
				signUp: created,
				userId,
			})
		},
		requireAuthenticated: (context) => readAuthenticated(state, context),
		requireRecentAuthentication: (context) => {
			const { session } = readAuthenticated(state, context)
			if (
				Date.now() - Date.parse(session.authenticatedAt) >
				sessionPolicy.recentAuthenticationMs
			) {
				rejectReauthentication()
			}
		},
		markAuthenticated: async (context) => {
			const { session } = readAuthenticated(state, context)
			if (!(await markSessionAuthenticated(collections(), session))) {
				rejectSession()
			}
		},
		revokeOtherSessionsOnPasswordChange: async (context) => {
			if (!sessionPolicy.revokeOnPasswordChange) return
			const { session, userId } = readAuthenticated(state, context)
			if (!(await revokeOtherSessions(collections(), session, userId))) {
				rejectSession()
			}
		},
		assertAttemptAllowed: async (subject, context, transaction) => {
			try {
				await assertAttemptAllowed(collections().attempts, subject)
			} catch (error: unknown) {
				if (
					error instanceof PluginError &&
					error.code === authErrorCodes.tooManyAttempts
				) {
					await transaction(() => {
						emit(
							'afterLoginFailed',
							{
								address: subjectAddress(subject),
								identifier: subject.identifier,
								limited: true,
								method: subject.method,
							},
							context.requestId,
						)
						return Promise.resolve()
					})
				}
				throw error
			}
		},
		resetAttempts: (subject) => resetAttempts(collections().attempts, subject),
		checkAttempt: (subject) =>
			assertAttemptAllowed(collections().attempts, subject),
		countAttempt: (subject) =>
			recordAttemptFailure(collections().attempts, subject),
		issueToken: (options) => issueAuthToken(collections(), options),
		findToken: (purpose, token) => findAuthToken(collections(), purpose, token),
		cancelToken: (userId, purpose) =>
			cancelAuthToken(collections(), userId, purpose),
		consumeToken: (purpose, token) =>
			consumeAuthToken(collections(), purpose, token),
		readUser: (userId) => readUserRecord(requireUser(state), userId),
		markEmailVerified: async ({ context, email, userId }) => {
			const user = await readUserRecord(requireUser(state), userId)
			if (user?.email !== email) return false
			const verified = user.emailVerified === true
			if (!verified) {
				await writeUserEmailFields(
					requireUser(state),
					userId,
					{ emailVerified: true, emailVerifiedAt: new Date().toISOString() },
					context,
				)
			}
			await verifyLinkedEmail(collections(), userId, email)
			if (verified) return false
			emit('afterEmailVerified', { email, userId }, context.requestId)
			return true
		},
		changeEmail: async ({ context, email, method, userId }) => {
			const user = await readUserRecord(requireUser(state), userId)
			const previousEmail = user?.email
			if (typeof previousEmail !== 'string') return rejectSession()
			await writeUserEmailFields(
				requireUser(state),
				userId,
				{
					email,
					emailVerified: true,
					emailVerifiedAt: new Date().toISOString(),
				},
				context,
			)
			await changeLinkedEmail(collections(), {
				email,
				method,
				previousEmail,
				userId,
			})
			emit(
				'afterEmailChanged',
				{ email, previousEmail, userId },
				context.requestId,
			)
			return previousEmail
		},
		completePasswordReset: async (userId, context) => {
			await advanceUserGeneration(collections(), userId)
			emit('afterPasswordReset', { userId }, context.requestId)
		},
		recordFailedAttempt: async (subject, context) => {
			await recordAttemptFailure(collections().attempts, subject)
			emit(
				'afterLoginFailed',
				{
					address: subjectAddress(subject),
					identifier: subject.identifier,
					limited: false,
					method: subject.method,
				},
				context.requestId,
			)
		},
	}
	return immutableRecord(services)
}
