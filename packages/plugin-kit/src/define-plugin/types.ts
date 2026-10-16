import type {
	ForbiddenMutationInputField,
	GenericField,
} from '@ultimabase/core'
import type {
	PluginInstance,
	PluginSchemaFieldsSource,
	PluginSchemaFeatureSource,
	PluginSchemaRulesSource,
	PluginSchemaStaticsSource,
	SchemaCommands,
	SchemaFieldsHKT,
	SchemaPermissions,
	SchemaFeature,
	SchemaRulesHKT,
	SchemaStaticsHKT,
} from '@ultimabase/core/plugin'

import type { CommandMutation } from './commands.js'
import type {
	FeatureDefinition,
	FeatureMember,
	FeatureOptionsOf,
	FeaturePermissionNames,
	FeatureRequiredRuleNames,
	Validator,
} from './feature.js'

/** Features of one plugin, keyed by `define` key. */
export type FeatureDefinitions = Readonly<Record<string, FeatureDefinition>>

/** Rule values of one plugin, keyed by `.with({ … })` entry. */
export type RuleValues = Readonly<Record<string, unknown>>

/** Validators of one plugin's `.with({ … })` entries, keyed by entry. */
export type RuleValidators = Readonly<Record<string, Validator<unknown>>>

/**
 * Rule values returned by one plugin's validators; none when the plugin
 * declares no rules. `definePlugin` infers the validators themselves:
 * inferring the values through a mapped type would give a reverse mapped
 * type, which TypeScript instantiates again inside every enclosing type and
 * which exceeds the instantiation depth (TS2589) once a registered
 * application reads it.
 */
export type RuleValuesOf<TValidators extends RuleValidators> =
	string extends keyof TValidators
		? Readonly<Record<never, never>>
		: { -readonly [TKey in keyof TValidators]: ReturnType<TValidators[TKey]> }

type UnionToIntersection<TValue> = (
	TValue extends unknown ? (value: TValue) => void : never
) extends (value: infer TIntersection) => void
	? TIntersection
	: never

// The fields or commands of the features a declaration set; features not
// set contribute nothing.
type SetFeatureMember<
	TFeatures extends FeatureDefinitions,
	TSet,
	TKey extends 'commands' | 'fields',
> = UnionToIntersection<
	{
		[TName in keyof TFeatures]: TName extends TSet
			? FeatureMember<TFeatures[TName], TKey>
			: unknown
	}[keyof TFeatures]
>

type ServerWrittenFields<TFields> = {
	readonly [TName in keyof TFields]: TFields[TName] extends GenericField
		? ForbiddenMutationInputField<TFields[TName]>
		: never
}

/** Fields slot of a plugin made by `definePlugin`. */
export interface DefinedFeatureFields<
	TFeatures extends FeatureDefinitions,
> extends SchemaFieldsHKT {
	readonly fields: ServerWrittenFields<
		SetFeatureMember<TFeatures, keyof this['shape'], 'fields'>
	>
}

type SetCommands<TFeatures extends FeatureDefinitions, TSet> = SetFeatureMember<
	TFeatures,
	TSet,
	'commands'
>

// Permission names of the features a declaration set.
type SetPermissions<TFeatures extends FeatureDefinitions, TSet> = {
	[TName in keyof TFeatures]: TName extends TSet
		? FeaturePermissionNames<TFeatures[TName]>
		: never
}[keyof TFeatures]

/** Statics slot of a plugin made by `definePlugin`: its commands and permissions. */
export interface DefinedFeatureCommands<
	TFeatures extends FeatureDefinitions,
> extends SchemaStaticsHKT {
	readonly statics: SchemaCommands<
		this['schema'],
		{
			readonly [
				TName in keyof SetCommands<TFeatures, keyof this['shape']>
			]: CommandMutation<SetCommands<TFeatures, keyof this['shape']>[TName]>
		}
	> &
		SchemaPermissions<SetPermissions<TFeatures, keyof this['shape']>>
}

/** Rules slot of a plugin made by `definePlugin`: its `.with({ … })` entries. */
export interface DefinedRules<
	TRules extends RuleValues,
> extends SchemaRulesHKT {
	readonly rules: { readonly [TKey in keyof TRules]?: TRules[TKey] }
}

/**
 * Arguments of one feature: none for a feature set with `true` only, or one
 * optional options object.
 */
export type FeatureArguments<TFeature> = [FeatureOptionsOf<TFeature>] extends [
	never,
]
	? readonly []
	: readonly [options?: FeatureOptionsOf<TFeature>]

type DefinedFeatureSource<TFeatures extends FeatureDefinitions> = [
	keyof TFeatures,
] extends [never]
	? never
	: | PluginSchemaFeatureSource<{
				readonly [TName in keyof TFeatures]: SchemaFeature<
					FeatureArguments<TFeatures[TName]>,
					Readonly<Record<TName, object>>,
					FeatureRequiredRuleNames<TFeatures[TName]>
				>
		  }>
		| PluginSchemaFieldsSource<DefinedFeatureFields<TFeatures>>
		| PluginSchemaStaticsSource<DefinedFeatureCommands<TFeatures>>

/** Static source of a plugin made by `definePlugin`. */
export type DefinedPluginSource<
	TFeatures extends FeatureDefinitions,
	TRules extends RuleValues,
> =
	| DefinedFeatureSource<TFeatures>
	| ([keyof TRules] extends [never]
			? never
			: PluginSchemaRulesSource<DefinedRules<TRules>>)

/** A plugin made by `definePlugin`. */
export type DefinedPlugin<
	TName extends string,
	TFeatures extends FeatureDefinitions,
	TRules extends RuleValues,
> = PluginInstance<{
	readonly id: TName
	readonly exports: unknown
	readonly instanceId: undefined
	readonly version: string
	readonly core: '^0.0.0'
	readonly dependencies: undefined
	readonly optionalDependencies: undefined
	readonly peers: undefined
	readonly conflicts: undefined
	readonly environment: undefined
	readonly capabilities: readonly []
	readonly source: DefinedPluginSource<TFeatures, TRules>
}>
