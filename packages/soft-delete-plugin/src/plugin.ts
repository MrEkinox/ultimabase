import {
	booleanField,
	providePersistencePlanRewriter,
	provideRuntimeConstraint,
	type CapabilityProviderDeclaration,
	type persistencePlanRewriterCapability,
	type pluginSchemaMutationHandlerCapability,
	type runtimeConstraintCapability,
} from '@ultimabase/core'
import {
	definePluginModule,
	patchSchemas,
	schemaPatch,
	type PluginModule,
	type PluginModuleInstance,
} from '@ultimabase/plugin-kit'

import {
	softDeleteNoInputTypegen,
	type SoftDeletePluginOptions,
} from './contracts.js'
import {
	normalizeSoftDeletePluginOptions,
	softDeleteSchemaOption,
} from './options.js'
import {
	createSoftDeleteVisibilityPolicy,
	softDeleteTombstoneContributionId,
	softDeleteTombstoneFieldName,
} from './visibility.js'
import { createSoftDeletePersistenceRewriter } from './replace-delete.js'
import {
	createExplicitSoftDeleteProviders,
	softDeleteMutation,
} from './explicit.js'
import {
	createSoftDeleteAdministrationProviders,
	purgeMutation,
	restoreMutation,
} from './administration.js'

const softDeletePluginModule: PluginModule<
	'@ultimabase/soft-delete-plugin',
	'0.0.0',
	'^0.0.0'
> = definePluginModule({
	core: '^0.0.0',
	pluginId: '@ultimabase/soft-delete-plugin',
	version: '0.0.0',
})

const softDeletePluginPrivileges = [
	{
		name: 'schema:declare',
		reason: 'Declares the direct soft-delete schema option.',
	},
	{
		name: 'runtime:constrain',
		reason: 'Keeps tombstoned rows outside ordinary operations.',
	},
	{
		name: 'persistence:rewrite',
		reason: 'Persists soft-delete effects as atomic tombstone updates.',
	},
	{
		name: 'operation:declare',
		reason: 'Declares soft-delete and administration mutations.',
	},
	{
		name: 'model:extend',
		reason: 'Adds soft-delete commands to enabled schema handles.',
	},
	{
		name: 'transport:expose',
		reason: 'Binds explicit soft delete to REST and GraphQL.',
	},
	{
		name: 'typegen:reference',
		reason: 'Preserves payload-free soft-delete commands in Typegen.',
	},
] as const

type SoftDeletePluginCapabilities = Readonly<{
	readonly provides: readonly [
		CapabilityProviderDeclaration<typeof runtimeConstraintCapability>,
		CapabilityProviderDeclaration<typeof persistencePlanRewriterCapability>,
		CapabilityProviderDeclaration<typeof pluginSchemaMutationHandlerCapability>,
		CapabilityProviderDeclaration,
		CapabilityProviderDeclaration,
		CapabilityProviderDeclaration<typeof pluginSchemaMutationHandlerCapability>,
		CapabilityProviderDeclaration<typeof pluginSchemaMutationHandlerCapability>,
	]
}>

type SoftDeletePluginDefinition = Readonly<{
	readonly capabilities: SoftDeletePluginCapabilities
	readonly instanceId?: string
	readonly privileges: typeof softDeletePluginPrivileges
}>

/** Names one configured official soft-delete declaration plugin. */
export type SoftDeletePlugin = PluginModuleInstance<
	typeof softDeletePluginModule,
	SoftDeletePluginDefinition
>

/**
 * Installs the official soft-delete schema contract explicitly.
 *
 * Importing the package alone changes nothing. An omitted `defaultMode` is
 * `disabled`, while a direct schema option may enable either supported mode.
 *
 * @example
 * ```ts
 * softDeletePlugin({ defaultMode: 'disabled' })
 * ```
 */
export const softDeletePlugin = (
	options: SoftDeletePluginOptions = {},
): SoftDeletePlugin => {
	const normalized = normalizeSoftDeletePluginOptions(options)
	const visibilityProvider = provideRuntimeConstraint({
		contributionId: 'official-soft-delete-visibility',
		create: ({ owner, schemas }) => ({
			value: createSoftDeleteVisibilityPolicy(schemas, owner),
		}),
	})
	const replaceDeleteProvider = providePersistencePlanRewriter({
		contributionId: 'official-soft-delete-replace-delete',
		create: ({ owner, schemas }) => ({
			value: createSoftDeletePersistenceRewriter(
				schemas,
				owner,
				normalized.defaultMode,
			),
		}),
	})
	const explicitProviders = createExplicitSoftDeleteProviders()
	const administrationProviders = createSoftDeleteAdministrationProviders()
	const tombstonePatch = schemaPatch().addField({
		contributionId: softDeleteTombstoneContributionId,
		field: booleanField({ default: false, required: true }),
		mutationInput: 'forbidden',
		name: softDeleteTombstoneFieldName,
	})

	return softDeletePluginModule.plugin({
		...(normalized.instanceId === undefined
			? {}
			: { instanceId: normalized.instanceId }),
		privileges: softDeletePluginPrivileges,
		capabilities: {
			provides: [
				visibilityProvider,
				replaceDeleteProvider,
				...explicitProviders,
				...administrationProviders,
			],
		},
		declare: ({ models, operations, schemas, typegenReferences }) => {
			typegenReferences.register(softDeleteNoInputTypegen)
			operations.declare(softDeleteMutation)
			operations.declare(restoreMutation)
			operations.declare(purgeMutation)
			schemas.defineOptions({
				contributionId: 'official-soft-delete-schema-option',
				schema: { softDelete: softDeleteSchemaOption },
				staticOptions: { defaultMode: normalized.defaultMode },
			})
			for (const mode of ['explicit', 'replace-delete'] as const) {
				schemas.patch(
					patchSchemas({
						patch: tombstonePatch,
						targets: schemas.select({
							option: { equals: mode, name: 'softDelete' },
							owner: { kind: 'application' },
						}),
					}),
				)
			}
			if (normalized.defaultMode !== 'disabled') {
				schemas.patch(
					patchSchemas({
						patch: tombstonePatch,
						staticOptions: { defaultMode: normalized.defaultMode },
						targets: schemas.select({
							option: { name: 'softDelete', present: false },
							owner: { kind: 'application' },
						}),
					}),
				)
			}

			const explicitSurface = {
				contributionId: 'official-soft-delete-mutation',
				schemaMutations: {
					softDelete: {
						mutation: softDeleteMutation,
						surfaces: ['schema', 'model'] as const,
					},
				},
			}
			models.extend(
				{
					option: { equals: 'explicit', name: 'softDelete' },
					owner: { kind: 'application' },
				},
				explicitSurface,
			)
			if (normalized.defaultMode === 'explicit') {
				models.extend(
					{
						option: { name: 'softDelete', present: false },
						owner: { kind: 'application' },
					},
					{
						...explicitSurface,
						contributionId: 'official-soft-delete-default-mutation',
						staticOptions: { defaultMode: normalized.defaultMode },
					},
				)
			}

			const administrationSurface = {
				contributionId: 'official-soft-delete-administration',
				schemaMutations: {
					restore: {
						mutation: restoreMutation,
						surfaces: ['schema'] as const,
					},
					purge: {
						mutation: purgeMutation,
						surfaces: ['schema'] as const,
					},
				},
			}
			for (const mode of ['explicit', 'replace-delete'] as const) {
				models.extend(
					{
						option: { equals: mode, name: 'softDelete' },
						owner: { kind: 'application' },
					},
					{
						...administrationSurface,
						contributionId: `official-soft-delete-${mode}-administration`,
					},
				)
			}
			if (normalized.defaultMode !== 'disabled') {
				models.extend(
					{
						option: { name: 'softDelete', present: false },
						owner: { kind: 'application' },
					},
					{
						...administrationSurface,
						contributionId: 'official-soft-delete-default-administration',
						staticOptions: { defaultMode: normalized.defaultMode },
					},
				)
			}
		},
	})
}
