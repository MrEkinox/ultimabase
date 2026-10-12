import {
	applicationRequestExecutionCapability,
	getOperationSchema,
	provideRuntimeBehavior,
	requestPrincipalResolverCapability,
	type Pointer,
	type RuntimeFinalMutationGuardStage,
} from '@ultimabase/core'
import {
	contributeApplication,
	contributeDeclarations,
	plugin,
	provideCapability,
	provideSchemaFactories,
	requireCapability,
	withPluginPrivileges,
	type PluginEnvironmentClaim,
	type PluginInstance,
	type PluginOperationDefinition,
	type PluginSchemaFactoriesSource,
	type PluginSchemaStaticsSource,
} from '@ultimabase/core/plugin'
import { definePluginOptionsParser } from '@ultimabase/plugin-kit'
import { isUnknownArray } from '@ultimabase/shared'

import type { AuthLinking } from './accounts.js'
import {
	createAuthPluginExports,
	type AuthPluginExports,
} from './application-api.js'
import {
	emailVerificationFieldNames,
	guardProtectedEmailFields,
} from './email.js'
import { authErrorStatuses } from './errors.js'
import {
	createAuthEventEmitter,
	resolveAuthEventHandlers,
	type AuthEventHandlers,
} from './events.js'
import {
	createAuthServices,
	prepareCollections,
	requireCollections,
	requireUser,
	type AuthState,
} from './foundation.js'
import { authGraphqlBindings } from './graphql.js'
import { createAuthHandlers } from './handlers.js'
import { resolveAuthHttpOptions, type AuthHttpOptions } from './http-options.js'
import { provideAuthHttpResolver } from './http-resolver.js'
import { foundationRoutes, readCreateInputs } from './foundation-routes.js'
import { createAuthHttpTransport } from './http-transport.js'
import {
	readAuthMethodImplementation,
	type AuthMethod,
	type AuthMethodImplementation,
	type AuthMethodOperation,
	type AuthMethodUserFields,
} from './method.js'
import type { AuthFoundationOperation } from './operations.js'
import { defaultUndefinedOptions } from './policy-options.js'
import { authPrincipal } from './session.js'
import {
	resolveAuthSessionPolicy,
	type AuthSessionOptions,
} from './session-policy.js'
import { validateSessionToken } from './sessions.js'
import {
	authUserIdentityOption,
	authUserIdentityOptionName,
} from './user-identity.js'
import {
	createUserSchemaFactory,
	type UserSchemaFactories,
	type UserSchemaStaticsSlot,
} from './user-schema.js'

/** Identifies the authentication foundation. */
export const authPluginId = '@ultimabase/auth-plugin' as const

const authHttpPeers = [
	{ pluginId: '@ultimabase/http-plugin', version: '^0.0.0' },
] as const
const authPermissions = {
	'storage:private':
		'Stores sessions, linked accounts, attempt counters and method secrets outside application schemas.',
	'authority:elevate':
		'Creates users at sign-up and deletes them at account deletion, with audited elevation.',
} as const

const requestExecutionRequirement = requireCapability(
	applicationRequestExecutionCapability,
	'^1.0.0',
)

/** Projects each installed operation through the same Core receipt. */
type OperationSource<TOperation extends PluginOperationDefinition> =
	TOperation extends PluginOperationDefinition
		? Readonly<{
				operations: Readonly<Record<TOperation['name'], TOperation>>
			}>
		: never

type AuthSource<TMethods> =
	| PluginSchemaFactoriesSource<
			UserSchemaFactories<AuthMethodUserFields<TMethods>>
	  >
	| PluginSchemaStaticsSource<UserSchemaStaticsSlot<TMethods>>
	| OperationSource<AuthFoundationOperation | AuthMethodOperation<TMethods>>

/** The authentication foundation installed with its methods. */
export type AuthPlugin<
	TMethods extends readonly AuthMethod[] = readonly AuthMethod[],
> = PluginInstance<{
	readonly id: typeof authPluginId
	readonly exports: AuthPluginExports
	readonly version: '0.0.0'
	readonly core: '^0.0.0'
	readonly peers: readonly [] | typeof authHttpPeers
	readonly environment: readonly PluginEnvironmentClaim[]
	readonly source: AuthSource<TMethods>
}>

/** Configures `authPlugin` (ADR-0326). */
export interface AuthPluginOptions<
	TMethods extends readonly AuthMethod[] = readonly AuthMethod[],
> {
	/**
	 * The sign-in methods; they share the User, sessions and linked accounts.
	 * @example `methods: [password({ identifier: 'email' })]`
	 */
	readonly methods: TMethods
	/** Session lifetimes, revocation on password change and recent login. */
	readonly session?: AuthSessionOptions
	/**
	 * How a new method account joins an existing user: `'verified-email'`
	 * links automatically when both sides verified the same email; `'manual'`
	 * only through an authenticated user.
	 * @default "verified-email"
	 */
	readonly linking?: AuthLinking
	/** Prefix of the HTTP routes and the optional session cookie. */
	readonly http?: AuthHttpOptions
	/** Application handlers of authentication events, run after commit. */
	readonly events?: AuthEventHandlers
}

/** The `authPlugin` factory; `ultimabase.plugin(authPlugin)` reads its exports. */
export interface AuthPluginFactory {
	/**
	 * Installs authentication: adds `App.UserSchema`, sessions, the current
	 * principal and the `/api/auth` routes, with the given methods.
	 * @example `UltimaBase.use(authPlugin({ methods: [password({ identifier: 'email' })] }))`
	 */
	<const TMethods extends readonly AuthMethod[]>(
		options: AuthPluginOptions<TMethods>,
	): AuthPlugin<TMethods>
	readonly pluginId: typeof authPluginId
}

const parseOptions: (value: unknown) => Readonly<AuthPluginOptions> =
	definePluginOptionsParser({
		name: 'authPlugin options',
		keys: ['events', 'http', 'linking', 'methods', 'session'] as const,
		formatUnknownKey: (key) =>
			`authPlugin contains unknown option: ${String(key)}`,
		// Each value is validated by its own resolver below.
		normalize: (options) => options as AuthPluginOptions,
	})

const readMethods = (value: unknown): readonly AuthMethodImplementation[] => {
	if (!isUnknownArray(value) || value.length === 0) {
		throw new TypeError(
			'authPlugin methods must list at least one method, such as password()',
		)
	}
	const methods = value.map(readAuthMethodImplementation)
	const names = new Set(methods.map(({ name }) => name))
	if (names.size !== methods.length) {
		throw new TypeError('authPlugin methods must have distinct names')
	}
	return methods
}

const readLinking = (value: unknown): AuthLinking => {
	if (value === undefined) return 'verified-email'
	if (value !== 'verified-email' && value !== 'manual') {
		throw new TypeError(
			"authPlugin linking must be 'verified-email' or 'manual'",
		)
	}
	return value
}

const createAuthPlugin = <const TMethods extends readonly AuthMethod[]>(
	options: AuthPluginOptions<TMethods>,
): AuthPlugin<TMethods> => {
	const untrusted = parseOptions(defaultUndefinedOptions(options))
	const methods = readMethods(untrusted.methods)
	const sessionPolicy = resolveAuthSessionPolicy(untrusted.session)
	const http = resolveAuthHttpOptions(untrusted.http)
	const emit = createAuthEventEmitter(
		resolveAuthEventHandlers(untrusted.events),
	)
	const state: AuthState = {
		collections: undefined,
		methodCollections: new Map(),
		user: undefined,
		userClassName: undefined,
	}
	const services = createAuthServices({
		emit,
		linking: readLinking(untrusted.linking),
		sessionPolicy,
		state,
	})
	const methodContributions = methods.flatMap((method) =>
		method.contributions(services),
	)
	const statuses = new Map<string, number>([
		...Object.entries(authErrorStatuses),
		...methods.flatMap((method) => Object.entries(method.errorStatuses ?? {})),
	])
	const transport = createAuthHttpTransport(
		http,
		[...foundationRoutes, ...methods.flatMap((method) => method.routes ?? [])],
		statuses,
	)
	// With a method owning `email`, only the authentication flows write it.
	const protectedFields = methods.some((method) => method.userEmail === true)
		? ['email', ...emailVerificationFieldNames]
		: []
	let pluginExports: AuthPluginExports | undefined
	const userInvariants = provideRuntimeBehavior({
		contributionId: 'user-invariants',
		create: ({ callbacks, capabilities, owner }) => {
			pluginExports = createAuthPluginExports({
				callbacks,
				executor: capabilities.get(requestExecutionRequirement),
				owner,
				state,
			})
			const guard: RuntimeFinalMutationGuardStage = ({
				context,
				operation,
			}) => {
				if (getOperationSchema(operation) !== state.user) return
				for (const data of readCreateInputs(operation)) {
					for (const method of methods) method.checkUserData?.(data)
				}
				if (protectedFields.length > 0) {
					guardProtectedEmailFields(operation, context, protectedFields)
				}
			}
			return { value: { guardMutationInput: guard } }
		},
	})
	const principalResolver = provideCapability(
		requestPrincipalResolverCapability,
		{
			contributionId: 'auth-principal-resolver',
			create: () => ({
				value: {
					resolveCurrent: ({ context }): Pointer | undefined =>
						context.getValue(authPrincipal)?.user,
				},
			}),
		},
	)
	const environment = [
		...new Set(methods.flatMap((method) => method.environment ?? [])),
	]
	const instance = plugin({
		id: authPluginId,
		version: '0.0.0',
		core: '^0.0.0',
		contributions: [
			withPluginPrivileges(userInvariants, ['authority:elevate']),
			principalResolver,
			provideAuthHttpResolver({
				http,
				paths: transport.paths,
				validate: async (token) => {
					const validated = await validateSessionToken(
						requireCollections(state),
						token,
					)
					return validated === undefined
						? undefined
						: {
								context: validated.context,
								user: requireUser(state).pointer(validated.userId),
							}
				},
			}),
			transport.endpoints,
			requestExecutionRequirement,
			...createAuthHandlers({ emit, methods, services, state }),
			...authGraphqlBindings,
			...transport.bindings,
			...methodContributions,
			contributeDeclarations({
				schema: ({ schemas }) => {
					// The User stays an application schema (its Access, Hooks and
					// transports are the application's); the marker designates it.
					requireUser(state)
					schemas.defineOptions({
						contributionId: 'auth-user',
						schema: { [authUserIdentityOptionName]: authUserIdentityOption },
					})
					return undefined
				},
				privateStorage: ({ privateStorage }) => {
					for (const collection of prepareCollections(state, methods)) {
						privateStorage.register(collection)
					}
					return undefined
				},
			}),
			contributeApplication(({ capabilities }) => {
				if (pluginExports === undefined) {
					throw new TypeError('authPlugin exports are unavailable')
				}
				return {
					exports: pluginExports,
					startTransports: () => {
						transport.start(capabilities.get(requestExecutionRequirement))
					},
				}
			}),
		],
		environment,
		peers: http.cookie === undefined ? [] : authHttpPeers,
		permissions: authPermissions,
	}) as AuthPlugin<TMethods>
	return provideSchemaFactories<
		AuthPlugin<TMethods>,
		PluginSchemaFactoriesSource<UserSchemaFactories<unknown>>
	>(instance, {
		UserSchema: createUserSchemaFactory(state, methods, authPluginId),
	})
}

/**
 * Installs the authentication foundation (ADR-0326): `App.UserSchema`,
 * sessions shared by every method, the current principal, linked accounts
 * and the HTTP routes under one prefix.
 *
 * @example
 * ```ts
 * const App = UltimaBase.use(postgresPlugin(), authPlugin({ methods: [password({ identifier: 'email' })] }))
 * export const TodoUser = App.UserSchema.define({ className: 'TodoUser' }).with({})
 * ```
 */
export const authPlugin: AuthPluginFactory = Object.assign(createAuthPlugin, {
	pluginId: authPluginId,
})
