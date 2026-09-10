import {
	booleanField,
	provideRuntimeConstraint,
	runtimeConstraintCapability,
	type CapabilityProviderDeclaration,
} from '@ultimabase/core'
import {
	definePluginModule,
	patchSchemas,
	schemaPatch,
	type PluginModule,
	type PluginModuleInstance,
} from '@ultimabase/plugin-kit'

import type { SoftDeletePluginOptions } from './contracts.js'
import {
	normalizeSoftDeletePluginOptions,
	softDeleteSchemaOption,
} from './options.js'
import {
	createSoftDeleteVisibilityPolicy,
	softDeleteTombstoneContributionId,
	softDeleteTombstoneFieldName,
} from './visibility.js'

const softDeletePluginModule: PluginModule<
	'@ultimabase/soft-delete-plugin',
	'0.0.0',
	'^0.0.0'
> = definePluginModule({
	core: '^0.0.0',
	pluginId: '@ultimabase/soft-delete-plugin',
	version: '0.0.0',
})

const softDeletePluginPrivileges: readonly [
	Readonly<{
		readonly name: 'schema:declare'
		readonly reason: 'Declares the direct soft-delete schema option.'
	}>,
	Readonly<{
		readonly name: 'runtime:constrain'
		readonly reason: 'Keeps tombstoned rows outside ordinary operations.'
	}>,
] = [
	{
		name: 'schema:declare',
		reason: 'Declares the direct soft-delete schema option.',
	},
	{
		name: 'runtime:constrain',
		reason: 'Keeps tombstoned rows outside ordinary operations.',
	},
]

type SoftDeletePluginCapabilities = Readonly<{
	readonly provides: readonly [
		CapabilityProviderDeclaration<typeof runtimeConstraintCapability>,
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
		capabilities: { provides: [visibilityProvider] },
		declare: ({ schemas }) => {
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
		},
	})
}
