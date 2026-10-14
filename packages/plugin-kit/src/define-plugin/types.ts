import type {
	ForbiddenMutationInputField,
	GenericField,
} from '@ultimabase/core'
import type {
	PluginInstance,
	PluginSchemaFieldsSource,
	PluginSchemaRulesSource,
	PluginSchemaShapeSource,
	PluginSchemaStaticsSource,
	SchemaCommands,
	SchemaFieldsHKT,
	SchemaPermissions,
	SchemaRulesHKT,
	SchemaShapeMethod,
	SchemaStaticsHKT,
} from '@ultimabase/core/plugin'

import type { CommandMutation } from './commands.js'
import type {
	ShapeMethodDefinition,
	ShapeMethodMember,
	ShapeMethodOptionsOf,
	ShapeMethodPermissionNames,
	Validator,
} from './shape.js'

/** Shape methods of one plugin, keyed by method name. */
export type ShapeMethods = Readonly<Record<string, ShapeMethodDefinition>>

/** Rule values of one plugin, keyed by `.with({ ... })` entry. */
export type RuleValues = Readonly<Record<string, unknown>>

/** Validators of one plugin's `.with({ ... })` entries, keyed by entry. */
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

// The fields or commands of the shape methods a declaration called; methods
// not called contribute nothing.
type CalledShapeMember<
	TShape extends ShapeMethods,
	TCalled,
	TKey extends 'commands' | 'fields',
> = UnionToIntersection<
	{
		[TName in keyof TShape]: TName extends TCalled
			? ShapeMethodMember<TShape[TName], TKey>
			: unknown
	}[keyof TShape]
>

type ServerWrittenFields<TFields> = {
	readonly [TName in keyof TFields]: TFields[TName] extends GenericField
		? ForbiddenMutationInputField<TFields[TName]>
		: never
}

/** Fields slot of a plugin made by `definePlugin`. */
export interface DefinedShapeFields<
	TShape extends ShapeMethods,
> extends SchemaFieldsHKT {
	readonly fields: ServerWrittenFields<
		CalledShapeMember<TShape, keyof this['shape'], 'fields'>
	>
}

type CalledCommands<TShape extends ShapeMethods, TCalled> = CalledShapeMember<
	TShape,
	TCalled,
	'commands'
>

// Permission names of the shape methods a declaration called.
type CalledPermissions<TShape extends ShapeMethods, TCalled> = {
	[TName in keyof TShape]: TName extends TCalled
		? ShapeMethodPermissionNames<TShape[TName]>
		: never
}[keyof TShape]

/** Statics slot of a plugin made by `definePlugin`: its commands and permissions. */
export interface DefinedShapeCommands<
	TShape extends ShapeMethods,
> extends SchemaStaticsHKT {
	readonly statics: SchemaCommands<
		this['schema'],
		{
			readonly [
				TName in keyof CalledCommands<TShape, keyof this['shape']>
			]: CommandMutation<CalledCommands<TShape, keyof this['shape']>[TName]>
		}
	> &
		SchemaPermissions<CalledPermissions<TShape, keyof this['shape']>>
}

/** Rules slot of a plugin made by `definePlugin`: its `.with({ ... })` entries. */
export interface DefinedRules<
	TRules extends RuleValues,
> extends SchemaRulesHKT {
	readonly rules: { readonly [TKey in keyof TRules]?: TRules[TKey] }
}

/** Arguments of one shape method: none, or one optional options object. */
export type ShapeMethodArguments<TMethod> = [
	ShapeMethodOptionsOf<TMethod>,
] extends [never]
	? readonly []
	: readonly [options?: ShapeMethodOptionsOf<TMethod>]

type DefinedShapeSource<TShape extends ShapeMethods> = [keyof TShape] extends [
	never,
]
	? never
	: | PluginSchemaShapeSource<{
				readonly [TName in keyof TShape]: SchemaShapeMethod<
					ShapeMethodArguments<TShape[TName]>,
					Readonly<Record<TName, object>>
				>
		  }>
		| PluginSchemaFieldsSource<DefinedShapeFields<TShape>>
		| PluginSchemaStaticsSource<DefinedShapeCommands<TShape>>

/** Static source of a plugin made by `definePlugin`. */
export type DefinedPluginSource<
	TShape extends ShapeMethods,
	TRules extends RuleValues,
> =
	| DefinedShapeSource<TShape>
	| ([keyof TRules] extends [never]
			? never
			: PluginSchemaRulesSource<DefinedRules<TRules>>)

/** A plugin made by `definePlugin`. */
export type DefinedPlugin<
	TName extends string,
	TShape extends ShapeMethods,
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
	readonly source: DefinedPluginSource<TShape, TRules>
}>
