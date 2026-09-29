import { isPlainRecord } from '@ultimabase/shared'

import type { FrameworkApplicationOptions } from '../../application/framework-application.js'
import type { PluginPrivilegeReport } from '../../application/plugin-privilege-policy.js'
import type { PluginDefinition } from '../../plugins/definition.js'
import type { CompiledTypegenGraph } from '../../plugins/typegen-declarations.js'
import type { SchemaDefinition, SchemaRegistry } from '../../schema/index.js'
import type {
	OwnedFieldBuilderMethod,
	OwnedPluginFieldType,
} from '../../schema/schema/field-builder-methods.js'
import {
	normalizeCreateFrameworkEngineOptions,
	type CreateFrameworkEngineOptions,
} from './create-framework-engine.js'

const ultimaBaseOptionKeys = new Set([
	'access',
	'masterAuthority',
	'pluginPrivileges',
	'plugins',
	'schemas',
	'validation',
])

/** Configures one application instance without repeating its factory's plugins. */
export interface UltimaBaseInstanceOptions<
	TSchemas extends readonly SchemaDefinition[],
	TPlugins extends readonly PluginDefinition[],
> extends CreateFrameworkEngineOptions {
	/** Registers the exact immutable schemas owned by this UltimaBase instance. */
	readonly schemas: TSchemas
	/** Configures plugin privilege policy and startup reporting. */
	readonly pluginPrivileges?: NonNullable<
		FrameworkApplicationOptions<TSchemas, TPlugins>['pluginPrivileges']
	>
	/** Supplies the optional audited authority used for explicit master access. */
	readonly masterAuthority?: NonNullable<
		CreateFrameworkEngineOptions['masterAuthority']
	>
	/** Configures structural validation, application time, and UUID generation. */
	readonly validation?: NonNullable<CreateFrameworkEngineOptions['validation']>
}

/** Retains the constructor plugin form only for the bounded migration window. */
export type UltimaBaseOptions<
	TSchemas extends readonly SchemaDefinition[],
	TPlugins extends readonly PluginDefinition[],
> = UltimaBaseInstanceOptions<TSchemas, TPlugins> &
	([TPlugins] extends [readonly []]
		? {
				/** @deprecated Install plugins once through `UltimaBase.use(plugin)`. */
				readonly plugins?: TPlugins
			}
		: {
				/** @deprecated Install plugins once through `UltimaBase.use(plugin)`. */
				readonly plugins: TPlugins
			})

/** Immutable callback-free application facts available without starting resources. */
export interface CompiledApplication<
	TSchemas extends readonly SchemaDefinition[] = readonly SchemaDefinition[],
> {
	readonly fieldBuilderMethods: readonly OwnedFieldBuilderMethod[]
	readonly pluginFieldTypes: readonly OwnedPluginFieldType[]
	readonly pluginPrivilegeReport: PluginPrivilegeReport
	readonly privateStorageFingerprint?: string
	readonly schemas: SchemaRegistry<TSchemas>
	readonly typegenGraph: CompiledTypegenGraph
}

/** Validates the closed application constructor shape before any plugin work. */
export const assertUltimaBaseOptions: (
	options: unknown,
) => asserts options is UltimaBaseOptions<
	readonly SchemaDefinition[],
	readonly PluginDefinition[]
> = (options) => {
	if (!isPlainRecord(options)) {
		throw new TypeError('UltimaBase options must be a plain object')
	}
	for (const key of Object.keys(options)) {
		if (!ultimaBaseOptionKeys.has(key)) {
			throw new TypeError(`UltimaBase contains unknown option: ${key}`)
		}
	}
}

/** Reads only the deprecated constructor input without widening Runtime options. */
export const readConstructorPlugins = (
	options: unknown,
): readonly PluginDefinition[] | undefined => {
	if (!isPlainRecord(options)) return undefined
	return options.plugins as readonly PluginDefinition[] | undefined
}

/** Snapshots engine configuration independently from the plugin graph. */
export const readEngineOptions = <
	TSchemas extends readonly SchemaDefinition[],
	TPlugins extends readonly PluginDefinition[],
>(
	options: UltimaBaseOptions<TSchemas, TPlugins>,
): Readonly<CreateFrameworkEngineOptions> =>
	normalizeCreateFrameworkEngineOptions({
		...(options.masterAuthority === undefined
			? {}
			: { masterAuthority: options.masterAuthority }),
		...(options.validation === undefined
			? {}
			: { validation: options.validation }),
	})
