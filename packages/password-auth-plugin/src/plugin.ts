import {
	applicationRequestExecutionCapability,
	contributeOperationBinding,
	definePluginModule,
	getOperationSchema,
	provideCapability,
	provideRuntimeBehavior,
	requestPrincipalResolverCapability,
	requireCapability,
	type PluginCapabilityDeclaration,
	type PluginModule,
	type PluginModuleInstance,
	type PluginOperationAuthoringContribution,
	type CreateManyOperationAst,
	type CreateOneOperationAst,
	type DatabaseMutationOperationAst,
	type RuntimeFinalMutationGuardStage,
	type SchemaDefinition,
	type UpsertManyOperationAst,
	type UpsertOneOperationAst,
} from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'

import { createPasswordCredentialCollection } from './credentials.js'
import { createPasswordHttpCookieIntegration } from './http-cookie-routes.js'
import {
	resolvePasswordAuthHttpOptions,
	type PasswordAuthHttpOptions,
} from './http-options.js'
import { providePasswordHttpSessionResolver } from './http-session-resolver.js'
import {
	createPasswordAuthPluginExports,
	type PasswordAuthPluginExports,
} from './application-api.js'
import {
	resolvePasswordHashPolicy,
	type PasswordHashPolicyOptions,
} from './password-policy.js'
import {
	PasswordUser,
	isPasswordUserDefinition,
	type PasswordUserReference,
} from './user-schema.js'
import { normalizePasswordUsername } from './normalization.js'
import { assertPasswordHashEngineAvailable } from './password-hasher.js'
import { passwordAuthGraphqlBindings } from './graphql-operation-bindings.js'
import { passwordAuthRestBindings } from './operations.js'
import { createPasswordOperationHandlers } from './operation-handlers.js'
import {
	resolvePasswordSessionPolicy,
	type PasswordSessionPolicyOptions,
} from './session-policy.js'
import { passwordPrincipal } from './session.js'
import { createPasswordSessionCollection } from './sessions.js'

const passwordAuthPluginModule: PluginModule<
	'@ultimabase/password-auth-plugin',
	'0.0.0',
	'^0.0.0'
> = definePluginModule({
	core: '^0.0.0',
	pluginId: '@ultimabase/password-auth-plugin',
	version: '0.0.0',
})

const passwordAuthPluginEnvironment = ['environment:native-code'] as const
const passwordAuthHttpPeers = [
	{ pluginId: '@ultimabase/http-plugin', version: '^0.0.0' },
] as const
const passwordAuthPluginPrivileges = [
	{
		name: 'schema:declare',
		reason: 'Declares the exact plugin-owned local User identity schema.',
	},
	{
		name: 'storage:private',
		reason:
			'Stores password verifiers and session digests outside application schema surfaces.',
	},
	{
		name: 'operation:declare',
		reason: 'Declares the exact Password Auth identity transition operations.',
	},
	{
		name: 'transport:expose',
		reason:
			'Binds Password Auth operations to REST v1, GraphQL v1, and optional owned cookie routes.',
	},
	{
		name: 'typegen:reference',
		reason: 'References public Password Auth operation input and result types.',
	},
	{
		name: 'authority:elevate',
		reason: 'Creates a public User through one audited sign-up transaction.',
	},
	{
		name: 'runtime:intercept',
		reason: 'Preserves the canonical username invariant on direct User writes.',
	},
] as const

const requestExecutionRequirement = requireCapability(
	applicationRequestExecutionCapability,
	'^1.0.0',
)

type PasswordAuthPluginDefinition = Readonly<{
	readonly capabilities: readonly PluginCapabilityDeclaration[]
	readonly environment: typeof passwordAuthPluginEnvironment
	readonly operations: readonly PluginOperationAuthoringContribution[]
	readonly peers: readonly [] | typeof passwordAuthHttpPeers
	readonly privileges: typeof passwordAuthPluginPrivileges
	readonly setup: () => PasswordAuthPluginExports
}>

/** Names the exact official local username and password plugin. */
export type PasswordAuthPlugin = PluginModuleInstance<
	typeof passwordAuthPluginModule,
	Omit<PasswordAuthPluginDefinition, 'setup'> &
		Readonly<{ readonly setup: () => PasswordAuthPluginExports }>
>

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

const assertPluginOptions: (
	value: unknown,
) => asserts value is PasswordAuthPluginOptions = (value) => {
	if (!isPlainRecord(value)) {
		throw new TypeError('passwordAuthPlugin options must be a plain object')
	}
	for (const key of Object.keys(value)) {
		if (
			key !== 'http' &&
			key !== 'password' &&
			key !== 'session' &&
			key !== 'user'
		) {
			throw new TypeError(`passwordAuthPlugin contains unknown option: ${key}`)
		}
	}
}

const normalizePluginOptions = (value: unknown): PasswordAuthPluginOptions => {
	if (value === undefined) return {}
	assertPluginOptions(value)
	return value
}

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
		for (const input of readCreateInputs(operation)) {
			const username = input.username
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
	const untrusted = normalizePluginOptions(options)
	assertPasswordHashEngineAvailable()
	const usesDefaultUser = untrusted.user === undefined
	const user = (untrusted.user ?? PasswordUser) as TUser
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
	const httpSessionResolver = providePasswordHttpSessionResolver({
		cookie,
		credentials,
		sessions,
		user,
	})
	const bindingContributions = [
		...Object.values(passwordAuthRestBindings).map((binding) =>
			contributeOperationBinding(binding),
		),
		...Object.values(passwordAuthGraphqlBindings).map((binding) =>
			contributeOperationBinding(binding),
		),
	]

	return passwordAuthPluginModule.plugin({
		capabilities: [
			usernameInvariant,
			principalResolver,
			httpSessionResolver,
			...(httpCookieIntegration?.providers ?? []),
			requestExecutionRequirement,
		],
		operations: [...handlers, ...bindingContributions],
		environment: passwordAuthPluginEnvironment,
		peers: cookie === undefined ? [] : passwordAuthHttpPeers,
		privileges: passwordAuthPluginPrivileges,
		declare: ({ privateStorage, schemas }) => {
			const userSchemaDeclaration = {
				contributionId: 'password-user',
				schema: user,
				staticOptions: {
					identity: 'local-password',
					variant: usesDefaultUser ? 'default' : 'custom',
				},
			} as const
			if (usesDefaultUser) {
				schemas.add(userSchemaDeclaration)
			} else {
				schemas.claim(userSchemaDeclaration)
			}
			privateStorage.register(credentials)
			privateStorage.register(sessions)
			return undefined
		},
		setup: () => {
			if (pluginExports === undefined) {
				throw new TypeError('Password Auth application exports are unavailable')
			}
			return pluginExports
		},
		hooks: {
			startTransports: ({ capabilities }) => {
				httpCookieIntegration?.start(
					capabilities.get(requestExecutionRequirement),
				)
			},
		},
	})
}
