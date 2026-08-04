import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { GenericField } from '../fields/base/contract.js'

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

/** Collects fields contributed by one schema extension without naming their owner in Core. */
export type SchemaExtensionFields = Readonly<Record<string, GenericField>>

/** Carries optional physical schema contributions beside plugin-owned configuration. */
export interface SchemaExtensionContributions<
	TFields extends SchemaExtensionFields = SchemaExtensionFields,
> {
	/** Adds immutable reserved fields that participate in ordinary schema inference. */
	readonly fields: TFields
}

/**
 * Represents configuration attached to one schema definition.
 */
export type SchemaExtension<
	TName extends string,
	TConfig extends object,
	TPluginName extends string = string,
	TFields extends SchemaExtensionFields = Readonly<Record<never, never>>,
> = ExtensionDefinition<'schema', TName, TConfig, TPluginName> &
	Readonly<{
		readonly fields: TFields
	}>

/** Associates extension-specific options and output with one schema data context. */
export interface SchemaExtensionContextKind {
	readonly data: unknown
	readonly options: object
	readonly extension: SchemaExtension<string, object>
}

type AppliedSchemaExtensionContext<
	TKind extends SchemaExtensionContextKind,
	TData extends Readonly<Record<string, unknown>>,
> = TKind & Readonly<{ data: TData }>

/** Resolves one contextual extension factory's options for exact sibling fields. */
export type ContextualSchemaExtensionOptions<
	TKind extends SchemaExtensionContextKind,
	TData extends Readonly<Record<string, unknown>>,
> = AppliedSchemaExtensionContext<TKind, TData>['options']

/** Resolves one contextual extension factory's exact output type. */
export type ContextualSchemaExtensionResult<
	TKind extends SchemaExtensionContextKind,
	TData extends Readonly<Record<string, unknown>>,
> = AppliedSchemaExtensionContext<TKind, TData>['extension']

type ContextualSchemaExtensionBuilder<
	TKind extends SchemaExtensionContextKind,
> = <TData extends Readonly<Record<string, unknown>>>(
	options: ContextualSchemaExtensionOptions<TKind, TData>,
) => ContextualSchemaExtensionResult<TKind, TData>

const contextualSchemaExtensionBuilder: unique symbol = Symbol.for(
	'@ultimabase/core/contextual-schema-extension-builder/v1',
)

/** Marks a package factory that Core can bind to one exact sibling-field shape. */
export interface ContextualSchemaExtensionFactory<
	TKind extends SchemaExtensionContextKind,
> {
	readonly [contextualSchemaExtensionBuilder]: ContextualSchemaExtensionBuilder<TKind>
}

/** Supplies the neutral binding helper available to contextual extension declarations. */
export interface SchemaExtensionBindingContext<
	TData extends Readonly<Record<string, unknown>>,
> {
	/** Binds package-owned extension options to this schema's exact developer fields. */
	readonly bind: <TKind extends SchemaExtensionContextKind>(
		factory: ContextualSchemaExtensionFactory<TKind>,
		options: ContextualSchemaExtensionOptions<TKind, TData>,
	) => ContextualSchemaExtensionResult<TKind, TData>
}

/**
 * Marks one generic package factory for contextual schema declaration binding.
 *
 * Extension authors declare the relationship once; applications then use the
 * neutral `bind(factory, options)` helper exposed by `Schema.define()`.
 */
export const defineContextualSchemaExtensionFactory =
	<TKind extends SchemaExtensionContextKind>(): (<
		TFactory extends ContextualSchemaExtensionBuilder<TKind>,
	>(
		factory: TFactory,
	) => TFactory & ContextualSchemaExtensionFactory<TKind>) =>
	<TFactory extends ContextualSchemaExtensionBuilder<TKind>>(
		factory: TFactory,
	): TFactory & ContextualSchemaExtensionFactory<TKind> =>
		Object.freeze(
			Object.assign(factory, {
				[contextualSchemaExtensionBuilder]: factory,
			}),
		)

/** Creates one immutable binder whose generic implementation remains package-neutral. */
export const createSchemaExtensionBindingContext = <
	TData extends Readonly<Record<string, unknown>>,
>(): SchemaExtensionBindingContext<TData> =>
	immutableRecord({
		bind: <TKind extends SchemaExtensionContextKind>(
			factory: ContextualSchemaExtensionFactory<TKind>,
			options: ContextualSchemaExtensionOptions<TKind, TData>,
		): ContextualSchemaExtensionResult<TKind, TData> => {
			if (typeof factory[contextualSchemaExtensionBuilder] !== 'function') {
				throw new TypeError('Invalid contextual schema extension factory')
			}

			return factory[contextualSchemaExtensionBuilder]<TData>(options)
		},
	})

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

/** Lets an extension contribute reserved fields through the neutral schema contract. */
export function defineSchemaExtension<
	const TName extends string,
	const TConfig extends object,
	const TPluginName extends string,
	const TFields extends SchemaExtensionFields,
>(
	name: TName,
	config: TConfig,
	pluginName: TPluginName,
	contributions: SchemaExtensionContributions<TFields>,
): SchemaExtension<TName, TConfig, TPluginName, TFields>

export function defineSchemaExtension(
	name: string,
	config: object,
	pluginName: string = name,
	contributions?: SchemaExtensionContributions,
): SchemaExtension<string, object, string, SchemaExtensionFields> {
	const extension = createExtension('schema', name, config, pluginName)
	const untrustedContributions: unknown = contributions

	if (
		untrustedContributions !== undefined &&
		(!isPlainRecord(untrustedContributions) ||
			!isPlainRecord(untrustedContributions.fields))
	) {
		throw new TypeError('schema extension contributions must define fields')
	}

	return immutableRecord({
		...extension,
		fields: immutableRecord(contributions?.fields ?? {}),
	})
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

		if (extension.scope === 'schema' && !isPlainRecord(extension.fields)) {
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
