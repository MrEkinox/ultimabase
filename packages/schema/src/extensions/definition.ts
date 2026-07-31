import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

declare const fieldInferenceMarker: unique symbol

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

/**
 * Describes the optional value override contributed by a field extension per operation.
 *
 * Returning never removes the field from the corresponding inferred shape.
 */
export interface FieldInferenceOverride {
	readonly object?: unknown
	readonly create?: unknown
	readonly update?: unknown
}

/**
 * Associates inference-only metadata with a regular opaque field extension.
 *
 * The symbol property never exists at runtime, so Schema remains independent from plugins.
 */
export type FieldInferenceExtension<
	TName extends string,
	TConfig extends object,
	TInference extends FieldInferenceOverride,
> = FieldExtension<TName, TConfig> & {
	readonly [fieldInferenceMarker]?: TInference
}

/**
 * Extracts the inference contract carried by a field extension.
 */
export type FieldExtensionInference<TExtension> = TExtension extends {
	readonly [fieldInferenceMarker]?: infer TInference extends
		FieldInferenceOverride
}
	? TInference
	: object

const createExtension = <
	const TScope extends ExtensionScope,
	const TName extends string,
	const TConfig extends object,
>(
	scope: TScope,
	name: TName,
	config: TConfig,
): ExtensionDefinition<TScope, TName, TConfig> => {
	assertNonEmptyString(name, 'extension name')

	if (!isPlainRecord(config)) {
		throw new TypeError('extension config must be an object')
	}

	return immutableRecord({
		scope,
		name,
		config: immutableRecord(config),
	})
}

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
