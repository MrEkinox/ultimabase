import {
	definePluginModule,
	type PluginModule,
	type PluginModuleInstance,
} from '@ultimabase/plugin-kit'

import type { SoftDeletePluginOptions } from './contracts.js'
import {
	normalizeSoftDeletePluginOptions,
	softDeleteSchemaOption,
} from './options.js'

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
] = [
	{
		name: 'schema:declare',
		reason: 'Declares the direct soft-delete schema option.',
	},
]

type SoftDeletePluginDefinition = Readonly<{
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

	return softDeletePluginModule.plugin({
		...(normalized.instanceId === undefined
			? {}
			: { instanceId: normalized.instanceId }),
		privileges: softDeletePluginPrivileges,
		declare: ({ schemas }) => {
			schemas.defineOptions({
				contributionId: 'official-soft-delete-schema-option',
				schema: { softDelete: softDeleteSchemaOption },
				staticOptions: { defaultMode: normalized.defaultMode },
			})
		},
	})
}
