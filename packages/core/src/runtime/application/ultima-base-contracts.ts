import { assertExactEnumerablePlainObject } from '../../exact-object-validation.js'

import type { LogLevel, Logger } from '../../application/application-log.js'
import type { RegisterDeclarationCheck } from './schema-registration-checks.js'
import type { FrameworkApplicationOptions } from '../../application/framework-application.js'
import type { PluginPrivilegeReport } from '../../application/plugin-privilege-policy.js'
import type { PluginDefinition } from '../../plugins/definition.js'
import type {
	CompiledOperationFacts,
	CompiledSchemaSurfaceFacts,
} from '../../plugins/application-surface-contracts.js'
import type { SchemaDefinition, SchemaRegistry } from '../../schema/index.js'
import type { OwnedFieldBuilderMethod } from '../../schema/schema/field-builder-methods.js'
import {
	normalizeCreateFrameworkEngineOptions,
	type CreateFrameworkEngineOptions,
} from './create-framework-engine.js'

const ultimaBaseOptionKeys = new Set([
	'logLevel',
	'logger',
	'masterAuthority',
	'pluginPrivileges',
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
	/** Denies plugin privileges and environment claims for this application. */
	readonly pluginPrivileges?: NonNullable<
		FrameworkApplicationOptions<TSchemas, TPlugins>['pluginPrivileges']
	>
	/**
	 * Receives Core and plugin log lines: the console by default, any object
	 * with `debug`, `info`, `warn` and `error`, or `false` to silence
	 * everything (ADR-0313).
	 *
	 * @example `logger: false`
	 */
	readonly logger?: Logger | false
	/**
	 * Lowest level written to the logger. `'debug'` adds the plugin privilege
	 * report and derived plugin defaults. @default 'info'
	 */
	readonly logLevel?: LogLevel
	/** Supplies the optional audited authority used for explicit master access. */
	readonly masterAuthority?: NonNullable<
		CreateFrameworkEngineOptions['masterAuthority']
	>
	/** Configures structural validation, application time, and UUID generation. */
	readonly validation?: NonNullable<CreateFrameworkEngineOptions['validation']>
}

/** Prevents explicit generic arguments from inventing plugins on the root. */
export type RootUltimaBaseOptions<
	TSchemas extends readonly SchemaDefinition[],
	TPlugins extends readonly PluginDefinition[],
> = UltimaBaseInstanceOptions<TSchemas, TPlugins> &
	RegisterDeclarationCheck<TSchemas> &
	([TPlugins] extends [readonly []] ? unknown : never)

/** Immutable callback-free application facts available without starting resources. */
export interface CompiledApplication<
	TSchemas extends readonly SchemaDefinition[] = readonly SchemaDefinition[],
> {
	readonly fieldBuilderMethods: readonly OwnedFieldBuilderMethod[]
	/** Operations declared by plugins, without their executable parts. */
	readonly operations: readonly CompiledOperationFacts[]
	readonly pluginPrivilegeReport: PluginPrivilegeReport
	readonly privateStorageFingerprint?: string
	/** Plugin commands added to each schema, without their executable parts. */
	readonly schemaSurfaces: readonly CompiledSchemaSurfaceFacts[]
	readonly schemas: SchemaRegistry<TSchemas>
}

/** Validates the closed application constructor shape before any plugin work. */
export const assertUltimaBaseOptions: (
	options: unknown,
) => asserts options is UltimaBaseInstanceOptions<
	readonly SchemaDefinition[],
	readonly PluginDefinition[]
> = (options) => {
	assertExactEnumerablePlainObject(
		options,
		ultimaBaseOptionKeys,
		'UltimaBase options must be a plain object',
		'UltimaBase contains unknown option: ',
	)
}

/** Snapshots engine configuration independently from the plugin graph. */
export const readEngineOptions = <
	TSchemas extends readonly SchemaDefinition[],
	TPlugins extends readonly PluginDefinition[],
>(
	options: UltimaBaseInstanceOptions<TSchemas, TPlugins>,
): Readonly<CreateFrameworkEngineOptions> =>
	normalizeCreateFrameworkEngineOptions({
		...(options.masterAuthority === undefined
			? {}
			: { masterAuthority: options.masterAuthority }),
		...(options.validation === undefined
			? {}
			: { validation: options.validation }),
	})

/** @internal Shares one start result between concurrent `start()` calls. */
export interface StartedApplication<TApplication> {
	readonly source: Promise<void>
	readonly result: Promise<TApplication>
}
