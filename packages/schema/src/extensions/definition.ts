import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

/**
 * Identifies where an extension may be attached and keeps both namespaces independent.
 */
export type ExtensionScope = 'schema' | 'field'

/**
 * Carries plugin-owned configuration without teaching Schema how to interpret it.
 */
export interface ExtensionDefinition<
	TScope extends ExtensionScope,
	TName extends string,
	TConfig extends object,
	TPluginName extends string = string,
> {
	readonly scope: TScope
	readonly name: TName
	readonly pluginName: TPluginName
	readonly config: Readonly<TConfig>
}

/**
 * Represents configuration attached to one schema definition.
 */
export type SchemaExtension<
	TName extends string,
	TConfig extends object,
	TPluginName extends string = string,
> = ExtensionDefinition<'schema', TName, TConfig, TPluginName>

/**
 * Represents configuration attached to one field definition.
 */
export type FieldExtension<
	TName extends string,
	TConfig extends object,
	TPluginName extends string = string,
> = ExtensionDefinition<'field', TName, TConfig, TPluginName>

const createExtension = <
	const TScope extends ExtensionScope,
	const TName extends string,
	const TConfig extends object,
	const TPluginName extends string,
>(
	scope: TScope,
	name: TName,
	config: TConfig,
	pluginName: TPluginName,
): ExtensionDefinition<TScope, TName, TConfig, TPluginName> => {
	assertNonEmptyString(name, 'extension name')
	assertNonEmptyString(pluginName, 'extension pluginName')

	if (!isPlainRecord(config)) {
		throw new TypeError('extension config must be an object')
	}

	return immutableRecord({
		scope,
		name,
		pluginName,
		config: immutableRecord(config),
	})
}

/**
 * Creates an immutable schema extension while preserving its literal name and config.
 */
export function defineSchemaExtension<
	const TName extends string,
	const TConfig extends object,
>(name: TName, config: TConfig): SchemaExtension<TName, TConfig, TName>

/** Lets one plugin own several extension names without coupling Schema to it. */
export function defineSchemaExtension<
	const TName extends string,
	const TConfig extends object,
	const TPluginName extends string,
>(
	name: TName,
	config: TConfig,
	pluginName: TPluginName,
): SchemaExtension<TName, TConfig, TPluginName>

export function defineSchemaExtension(
	name: string,
	config: object,
	pluginName: string = name,
): SchemaExtension<string, object> {
	return createExtension('schema', name, config, pluginName)
}

/**
 * Creates an immutable field extension while preserving its literal name and config.
 */
export function defineFieldExtension<
	const TName extends string,
	const TConfig extends object,
>(name: TName, config: TConfig): FieldExtension<TName, TConfig, TName>

/** Lets one plugin own several field extension names through one handler set. */
export function defineFieldExtension<
	const TName extends string,
	const TConfig extends object,
	const TPluginName extends string,
>(
	name: TName,
	config: TConfig,
	pluginName: TPluginName,
): FieldExtension<TName, TConfig, TPluginName>

export function defineFieldExtension(
	name: string,
	config: object,
	pluginName: string = name,
): FieldExtension<string, object> {
	return createExtension('field', name, config, pluginName)
}

/**
 * Copies an extension list and rejects duplicate names within the same scope.
 */
export const defineExtensions = <
	const TExtensions extends readonly ExtensionDefinition<
		ExtensionScope,
		string,
		object
	>[],
>(
	extensions: TExtensions,
): readonly [...TExtensions] => {
	// Keep the generic tuple before runtime narrowing widens the local expression.
	const declaredExtensions = extensions
	const runtimeExtensions: unknown = extensions

	if (!isUnknownArray(runtimeExtensions)) {
		throw new TypeError('extensions must be a list')
	}

	const identities = new Set<string>()

	for (const extension of runtimeExtensions) {
		if (
			!isPlainRecord(extension) ||
			(extension.scope !== 'schema' && extension.scope !== 'field') ||
			typeof extension.name !== 'string' ||
			extension.name.length === 0 ||
			typeof extension.pluginName !== 'string' ||
			extension.pluginName.length === 0 ||
			!isPlainRecord(extension.config)
		) {
			throw new TypeError('Invalid extension definition')
		}

		const identity = `${extension.scope}:${extension.name}`

		if (identities.has(identity)) {
			throw new TypeError(
				`Duplicate ${extension.scope} extension: ${extension.name}`,
			)
		}

		identities.add(identity)
	}

	return immutableArray(declaredExtensions)
}
