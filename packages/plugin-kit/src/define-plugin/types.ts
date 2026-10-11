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
	SchemaRulesHKT,
	SchemaShapeMethod,
	SchemaStaticsHKT,
} from '@ultimabase/core/plugin'

import type { CommandMutation } from './commands.js'
import type {
	ShapeMethodDefinition,
	ShapeMethodMember,
	ShapeMethodOptionsOf,
} from './shape.js'

/** Shape methods of one plugin, keyed by method name. */
export type ShapeMethods = Readonly<Record<string, ShapeMethodDefinition>>

/** Rule values of one plugin, keyed by `.with({ ... })` entry. */
export type RuleValues = Readonly<Record<string, unknown>>

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

/** Statics slot of a plugin made by `definePlugin`: its commands. */
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
	>
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
