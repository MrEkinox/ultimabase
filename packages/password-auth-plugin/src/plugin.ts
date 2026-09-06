import {
	applicationRequestExecutionCapability,
	provideCapability,
	provideOperationHandler,
	provideOperationTransportBinding,
	provideRuntimeBehavior,
	requestPrincipalResolverCapability,
	requireCapability,
	type CapabilityProviderDeclaration,
	type CapabilityRequirement,
	type CreateManyOperationAst,
	type CreateOneOperationAst,
	type DatabaseMutationOperationAst,
	type RuntimeFinalMutationGuardStage,
	type SchemaDefinition,
	type UpdateManyOperationAst,
	type UpdateOneOperationAst,
	type UpsertManyOperationAst,
	type UpsertOneOperationAst,
	type DeleteManyOperationAst,
	type DeleteOneOperationAst,
} from '@ultimabase/core'
import {
	definePluginModule,
	type PluginModule,
	type PluginModuleInstance,
} from '@ultimabase/plugin-kit'
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
	type PasswordUserDefinition,
} from './user-schema.js'
import { normalizePasswordUsername } from './normalization.js'
import { assertPasswordHashEngineAvailable } from './password-hasher.js'
import {
	passwordAuthOperations,
	passwordAuthRestBindings,
	passwordAuthTypegenReferences,
} from './operations.js'
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
			'Binds Password Auth operations to REST v1 and optional owned cookie routes.',
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
	readonly capabilities: Readonly<{
		readonly provides: readonly CapabilityProviderDeclaration[]
		readonly requires: readonly CapabilityRequirement[]
	}>
	readonly environment: typeof passwordAuthPluginEnvironment
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
	TUser extends PasswordUserDefinition = PasswordUserDefinition,
> {
	/** Selects the exact final User schema created by PasswordUserSchema.define(). */
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

const readOperationSchema = (
	operation: DatabaseMutationOperationAst,
): SchemaDefinition => {
	switch (operation.kind) {
		case 'create-one':
			return (operation as unknown as CreateOneOperationAst<SchemaDefinition>)
				.schema.definition
		case 'create-many':
			return (operation as unknown as CreateManyOperationAst<SchemaDefinition>)
				.schema.definition
		case 'update-one':
			return (operation as unknown as UpdateOneOperationAst<SchemaDefinition>)
				.query.schema.definition
		case 'update-many':
			return (operation as unknown as UpdateManyOperationAst<SchemaDefinition>)
				.query.schema.definition
		case 'upsert-one':
			return (operation as unknown as UpsertOneOperationAst<SchemaDefinition>)
				.query.schema.definition
		case 'delete-one':
			return (operation as unknown as DeleteOneOperationAst<SchemaDefinition>)
				.query.schema.definition
		case 'delete-many':
			return (operation as unknown as DeleteManyOperationAst<SchemaDefinition>)
				.query.schema.definition
		case 'upsert-many': {
			const first = (
				operation as unknown as UpsertManyOperationAst<SchemaDefinition>
			).items[0]
			if (first === undefined) {
				throw new TypeError('Password User bulk upsert has no schema')
			}
			return first.query.schema.definition
		}
	}
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
		if (readOperationSchema(operation) !== user) return
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
	const TUser extends PasswordUserDefinition = typeof PasswordUser,
>(
	options?: PasswordAuthPluginOptions<TUser>,
): PasswordAuthPlugin => {
	const untrusted = normalizePluginOptions(options)
	assertPasswordHashEngineAvailable()
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
		sessions,
		user,
	})
	const handlerProviders = handlers.map((handler, index) =>
		provideOperationHandler({
			contributionId: `password-operation-${String(index)}`,
			create: () => ({ value: handler }),
		}),
	)
	const bindingProviders = Object.entries(passwordAuthRestBindings).map(
		([name, binding]) =>
			provideOperationTransportBinding({
				contributionId: `password-rest-${name}`,
				create: () => ({ value: binding }),
			}),
	)

	return passwordAuthPluginModule.plugin({
		capabilities: {
			provides: [
				usernameInvariant,
				principalResolver,
				httpSessionResolver,
				...handlerProviders,
				...bindingProviders,
				...(httpCookieIntegration?.providers ?? []),
			],
			requires: [requestExecutionRequirement],
		},
		environment: passwordAuthPluginEnvironment,
		peers: cookie === undefined ? [] : passwordAuthHttpPeers,
		privileges: passwordAuthPluginPrivileges,
		declare: ({ operations, privateStorage, schemas, typegenReferences }) => {
			schemas.add({
				contributionId: 'password-user',
				schema: user,
				staticOptions: {
					identity: 'local-password',
					variant: user === PasswordUser ? 'default' : 'custom',
				},
			})
			privateStorage.register(credentials)
			privateStorage.register(sessions)
			for (const operation of Object.values(passwordAuthOperations)) {
				operations.declare(operation)
			}
			for (const reference of passwordAuthTypegenReferences) {
				typegenReferences.register(reference)
			}
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
