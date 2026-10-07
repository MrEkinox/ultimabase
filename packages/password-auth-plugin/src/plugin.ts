import {
	applicationRequestExecutionCapability,
	contributeApplication,
	contributeDeclarations,
	contributeOperationBinding,
	getOperationSchema,
	plugin,
	provideCapability,
	provideRuntimeBehavior,
	requestPrincipalResolverCapability,
	requireCapability,
	withPluginPrivileges,
	type CreateManyOperationAst,
	type CreateOneOperationAst,
	type DatabaseMutationOperationAst,
	type PluginInstance,
	type PluginOperationDefinition,
	type RuntimeFinalMutationGuardStage,
	type SchemaDefinition,
	type UpsertManyOperationAst,
	type UpsertOneOperationAst,
} from '@ultimabase/core'
import { definePluginOptionsParser } from '@ultimabase/plugin-kit'

import { createPasswordCredentialCollection } from './credentials.js'
import {
	createPasswordAuthPluginExports,
	type PasswordAuthPluginExports,
} from './application-api.js'
import { passwordAuthGraphqlBindings } from './graphql-operation-bindings.js'
import { createPasswordHttpCookieIntegration } from './http-cookie-routes.js'
import {
	resolvePasswordAuthHttpOptions,
	type PasswordAuthHttpOptions,
} from './http-options.js'
import { providePasswordHttpSessionResolver } from './http-session-resolver.js'
import { normalizePasswordUsername } from './normalization.js'
import { createPasswordOperationHandlers } from './operation-handlers.js'
import { passwordAuthRestBindings } from './operations.js'
import { assertPasswordHashEngineAvailable } from './password-hasher.js'
import {
	resolvePasswordHashPolicy,
	type PasswordHashPolicyOptions,
} from './password-policy.js'
import { defaultUndefinedOptions } from './policy-options.js'
import {
	resolvePasswordSessionPolicy,
	type PasswordSessionPolicyOptions,
} from './session-policy.js'
import { passwordPrincipal } from './session.js'
import { createPasswordSessionCollection } from './sessions.js'
import {
	PasswordUser,
	isPasswordUserDefinition,
	type PasswordUserReference,
} from './user-schema.js'

const passwordAuthPluginEnvironment = ['environment:native-code'] as const
const passwordAuthHttpPeers = [
	{ pluginId: '@ultimabase/http-plugin', version: '^0.0.0' },
] as const
const passwordAuthPluginPermissions = {
	'schema:declare':
		'Declares the exact plugin-owned local User identity schema.',
	'storage:private':
		'Stores password verifiers and session digests outside application schema surfaces.',
	'operation:declare':
		'Declares the exact Password Auth identity transition operations.',
	'transport:expose':
		'Binds Password Auth operations to REST v1, GraphQL v1, and optional owned cookie routes.',
	'typegen:reference':
		'References public Password Auth operation input and result types.',
	'authority:elevate':
		'Creates a public User through one audited sign-up transaction.',
	'runtime:intercept':
		'Preserves the canonical username invariant on direct User writes.',
} as const

const requestExecutionRequirement = requireCapability(
	applicationRequestExecutionCapability,
	'^1.0.0',
)

type PasswordAuthInstalledOperation = ReturnType<
	typeof createPasswordOperationHandlers
>[number]['operation']

/** Projects each installed handler through the same independent Core receipt. */
type PasswordAuthOperationSource<TOperation extends PluginOperationDefinition> =
	TOperation extends PluginOperationDefinition
		? Readonly<{
				operations: Readonly<Record<TOperation['name'], TOperation>>
			}>
		: never

type PasswordAuthSource =
	PasswordAuthOperationSource<PasswordAuthInstalledOperation>

/** Names the exact official local username and password plugin. */
export type PasswordAuthPlugin = PluginInstance<{
	readonly id: '@ultimabase/password-auth-plugin'
	readonly exports: PasswordAuthPluginExports
	readonly version: '0.0.0'
	readonly core: '^0.0.0'
	readonly peers: readonly [] | typeof passwordAuthHttpPeers
	readonly environment: typeof passwordAuthPluginEnvironment
	readonly source: PasswordAuthSource
}>

/** Configures the one local User identity domain owned by Password Auth v1. */
export interface PasswordAuthPluginOptions<
	TUser extends PasswordUserReference = PasswordUserReference,
> {
	/** Selects the exact User schema, which must also appear in the application root `schemas` list. */
	readonly user?: TUser
	/** Selects bounded Argon2id parameters and their monotonic policy version. */
	readonly password?: PasswordHashPolicyOptions
	/** Selects bounded rolling and absolute session lifetimes. */
	readonly session?: PasswordSessionPolicyOptions
	/** Keeps Bearer enabled and optionally adds strict secure-cookie routes. */
	readonly http?: PasswordAuthHttpOptions
}

// Only the root keys are checked here; each value is still validated by its
// own resolver, so the typed view below is not trusted.
const parsePluginOptions: (
	value: unknown,
) => Readonly<PasswordAuthPluginOptions> = definePluginOptionsParser({
	name: 'passwordAuthPlugin options',
	keys: ['http', 'password', 'session', 'user'] as const,
	formatUnknownKey: (key) =>
		`passwordAuthPlugin contains unknown option: ${String(key)}`,
	normalize: (options) => options as PasswordAuthPluginOptions,
})

const readCreateInputs = (
	operation: DatabaseMutationOperationAst,
): readonly Readonly<Record<string, unknown>>[] => {
	switch (operation.kind) {
		case 'create-one':
			return [
				(operation as unknown as CreateOneOperationAst<SchemaDefinition>).input,
			]
		case 'create-many':
			return (operation as unknown as CreateManyOperationAst<SchemaDefinition>)
				.inputs
		case 'upsert-one':
			return [
				(operation as unknown as UpsertOneOperationAst<SchemaDefinition>)
					.create,
			]
		case 'upsert-many':
			return (
				operation as unknown as UpsertManyOperationAst<SchemaDefinition>
			).items.map(({ create }) => create)
		default:
			return []
	}
}

const createUsernameInvariant =
	(user: SchemaDefinition): RuntimeFinalMutationGuardStage =>
	({ operation }) => {
		// Core retains the same schema identity for every normalized mutation.
		if (getOperationSchema(operation) !== user) return
		for (const { username } of readCreateInputs(operation)) {
			if (
				typeof username !== 'string' ||
				normalizePasswordUsername(username) !== username
			) {
				throw new TypeError(
					'Password User username must use its canonical representation',
				)
			}
		}
	}

/** Installs one application-local User schema and its private credential store. */
export const passwordAuthPlugin = <
	const TUser extends PasswordUserReference = typeof PasswordUser,
>(
	options?: PasswordAuthPluginOptions<TUser>,
): PasswordAuthPlugin => {
	const untrusted = parsePluginOptions(defaultUndefinedOptions(options))
	assertPasswordHashEngineAvailable()
	const usesDefaultUser = untrusted.user === undefined
	const user: unknown = untrusted.user ?? PasswordUser
	if (!isPasswordUserDefinition(user)) {
		throw new TypeError(
			'passwordAuthPlugin user must be created by PasswordUserSchema.define()',
		)
	}
	const passwordPolicy = resolvePasswordHashPolicy(untrusted.password)
	const sessionPolicy = resolvePasswordSessionPolicy(untrusted.session)
	const cookie = resolvePasswordAuthHttpOptions(untrusted.http)
	const credentials = createPasswordCredentialCollection(user, passwordPolicy)
	const sessions = createPasswordSessionCollection(user, sessionPolicy)
	const httpCookieIntegration =
		cookie === undefined
			? undefined
			: createPasswordHttpCookieIntegration(cookie)
	const handlers = createPasswordOperationHandlers({
		credentials,
		passwordPolicy,
		sessionPolicy,
		sessions,
		user,
	})
	let pluginExports: PasswordAuthPluginExports | undefined
	const usernameInvariant = provideRuntimeBehavior({
		contributionId: 'canonical-usernames',
		create: ({ callbacks, capabilities, owner }) => {
			pluginExports = createPasswordAuthPluginExports({
				callbacks,
				credentials,
				executor: capabilities.get(requestExecutionRequirement),
				owner,
				sessions,
				user,
			})
			return { value: { guardMutationInput: createUsernameInvariant(user) } }
		},
	})
	const principalResolver = provideCapability(
		requestPrincipalResolverCapability,
		{
			contributionId: 'password-principal-resolver',
			create: () => ({
				value: {
					resolveCurrent: ({ context }) =>
						context.getValue(passwordPrincipal)?.user,
				},
			}),
		},
	)
	const userDeclaration = {
		contributionId: 'password-user',
		schema: user,
		staticOptions: {
			identity: 'local-password',
			variant: usesDefaultUser ? 'default' : 'custom',
		},
	} as const

	return plugin({
		id: '@ultimabase/password-auth-plugin',
		version: '0.0.0',
		core: '^0.0.0',
		contributions: [
			withPluginPrivileges(usernameInvariant, ['authority:elevate']),
			principalResolver,
			providePasswordHttpSessionResolver({
				cookie,
				credentials,
				sessions,
				user,
			}),
			...(httpCookieIntegration?.capabilities ?? []),
			requestExecutionRequirement,
			...handlers,
			...[
				...Object.values(passwordAuthRestBindings),
				...Object.values(passwordAuthGraphqlBindings),
			].map((binding) => contributeOperationBinding(binding)),
			...(httpCookieIntegration?.operations ?? []),
			contributeDeclarations({
				schema: ({ schemas }) => {
					// The default User is added by this plugin; a custom one is
					// declared by the application and only claimed here.
					if (usesDefaultUser) {
						schemas.add(userDeclaration)
					} else {
						schemas.claim(userDeclaration)
					}
					return undefined
				},
				privateStorage: ({ privateStorage }) => {
					privateStorage.register(credentials)
					privateStorage.register(sessions)
					return undefined
				},
			}),
			contributeApplication(({ capabilities }) => {
				if (pluginExports === undefined) {
					throw new TypeError(
						'Password Auth application exports are unavailable',
					)
				}
				return {
					exports: pluginExports,
					startTransports: () => {
						httpCookieIntegration?.start(
							capabilities.get(requestExecutionRequirement),
						)
					},
				}
			}),
		],
		environment: passwordAuthPluginEnvironment,
		peers: cookie === undefined ? [] : passwordAuthHttpPeers,
		permissions: passwordAuthPluginPermissions,
	})
}
