import { immutableArray, immutableRecord } from '@ultimabase/shared'

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
> {
	readonly scope: TScope
	readonly name: TName
	readonly config: Readonly<TConfig>
}

/**
 * Represents configuration attached to one schema definition.
 */
export type SchemaExtension<
	TName extends string,
	TConfig extends object,
> = ExtensionDefinition<'schema', TName, TConfig>

/**
 * Represents configuration attached to one field definition.
 */
export type FieldExtension<
	TName extends string,
	TConfig extends object,
> = ExtensionDefinition<'field', TName, TConfig>

const createExtension = <
	const TScope extends ExtensionScope,
	const TName extends string,
	const TConfig extends object,
>(
	scope: TScope,
	name: TName,
	config: TConfig,
): ExtensionDefinition<TScope, TName, TConfig> =>
	immutableRecord({
		scope,
		name,
		config: immutableRecord(config),
	})

/**
 * Creates an immutable schema extension while preserving its literal name and config.
 */
export const defineSchemaExtension = <
	const TName extends string,
	const TConfig extends object,
>(
	name: TName,
	config: TConfig,
): SchemaExtension<TName, TConfig> => createExtension('schema', name, config)

/**
 * Creates an immutable field extension while preserving its literal name and config.
 */
export const defineFieldExtension = <
	const TName extends string,
	const TConfig extends object,
>(
	name: TName,
	config: TConfig,
): FieldExtension<TName, TConfig> => createExtension('field', name, config)

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
	const identities = new Set<string>()

	for (const extension of extensions) {
		const identity = `${extension.scope}:${extension.name}`

		if (identities.has(identity)) {
			throw new TypeError(
				`Duplicate ${extension.scope} extension: ${extension.name}`,
			)
		}

		identities.add(identity)
	}

	return immutableArray(extensions)
}
