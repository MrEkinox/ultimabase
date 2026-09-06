import {
	provideRuntimeBehavior,
	type CapabilityProviderDeclaration,
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
	type runtimeBehaviorCapability,
} from '@ultimabase/core'
import {
	definePluginModule,
	type PluginModule,
	type PluginModuleInstance,
} from '@ultimabase/plugin-kit'
import { isPlainRecord } from '@ultimabase/shared'

import { createPasswordCredentialCollection } from './credentials.js'
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
const passwordAuthPluginPrivileges = [
	{
		name: 'schema:declare',
		reason: 'Declares the exact plugin-owned local User identity schema.',
	},
	{
		name: 'storage:private',
		reason: 'Stores password verifiers outside application schema surfaces.',
	},
	{
		name: 'runtime:intercept',
		reason: 'Preserves the canonical username invariant on direct User writes.',
	},
] as const

type PasswordAuthPluginDefinition = Readonly<{
	readonly capabilities: Readonly<{
		readonly provides: readonly [
			CapabilityProviderDeclaration<typeof runtimeBehaviorCapability>,
		]
	}>
	readonly environment: typeof passwordAuthPluginEnvironment
	readonly privileges: typeof passwordAuthPluginPrivileges
}>

/** Names the exact official local username and password plugin. */
export type PasswordAuthPlugin = PluginModuleInstance<
	typeof passwordAuthPluginModule,
	PasswordAuthPluginDefinition
>

/** Configures the one local User identity domain owned by Password Auth v1. */
export interface PasswordAuthPluginOptions<
	TUser extends PasswordUserDefinition = PasswordUserDefinition,
> {
	/** Selects the exact final User schema created by PasswordUserSchema.define(). */
	readonly user?: TUser
	/** Selects bounded Argon2id parameters and their monotonic policy version. */
	readonly password?: PasswordHashPolicyOptions
}

const assertPluginOptions: (
	value: unknown,
) => asserts value is PasswordAuthPluginOptions = (value) => {
	if (!isPlainRecord(value)) {
		throw new TypeError('passwordAuthPlugin options must be a plain object')
	}
	for (const key of Object.keys(value)) {
		if (key !== 'password' && key !== 'user') {
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
	const user: SchemaDefinition = untrusted.user ?? PasswordUser
	if (!isPasswordUserDefinition(user)) {
		throw new TypeError(
			'passwordAuthPlugin user must be created by PasswordUserSchema.define()',
		)
	}
	const passwordPolicy = resolvePasswordHashPolicy(untrusted.password)
	const credentials = createPasswordCredentialCollection(user, passwordPolicy)
	const usernameInvariant = provideRuntimeBehavior({
		contributionId: 'canonical-usernames',
		create: () => ({
			value: { guardMutationInput: createUsernameInvariant(user) },
		}),
	})

	return passwordAuthPluginModule.plugin({
		capabilities: { provides: [usernameInvariant] },
		environment: passwordAuthPluginEnvironment,
		privileges: passwordAuthPluginPrivileges,
		declare: ({ privateStorage, schemas }) => {
			schemas.add({
				contributionId: 'password-user',
				schema: user,
				staticOptions: {
					identity: 'local-password',
					variant: user === PasswordUser ? 'default' : 'custom',
				},
			})
			privateStorage.register(credentials)
			return undefined
		},
	})
}
