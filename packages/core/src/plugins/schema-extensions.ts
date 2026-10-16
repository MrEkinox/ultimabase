import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { PluginDefinition, PluginSource } from './definition.js'
import { assertUnreservedSchemaKey } from './schema-rule-names.js'

/**
 * Higher-kinded slot through which one plugin contributes rule entries to the
 * final `.with({ ... })` call of a schema declaration. Core substitutes the
 * schema reference into `schema` and the shape methods called on the
 * declaration into `shape` (`{ acl: readonly [] }`, so a rule can be required
 * once its shape method is called), and reads `rules`; it never names a plugin.
 *
 * @example
 * ```ts
 * interface AuditRules extends SchemaRulesHKT {
 *   readonly rules: Readonly<{ audit?: AuditRule<this['schema']> }>
 * }
 * ```
 */
export interface SchemaRulesHKT {
	readonly schema: unknown
	readonly shape: object
	readonly rules: object
}

/** Source projection carrying one plugin's rule entries for `.with({ ... })`. */
export type PluginSchemaRulesSource<TRules extends SchemaRulesHKT> = Readonly<{
	schemaRules: TRules
}>

/**
 * Higher-kinded slot through which one plugin adds fields to a schema from the
 * shape methods called on its declaration (ADR-0316). Core substitutes
 * `shape`, the record of the shape methods called so far and their arguments
 * (`{ archivable: readonly [] }`), and reads `fields`. Fields never see the
 * schema, so they cannot create an initializer cycle.
 *
 * @example
 * ```ts
 * interface ArchiveFields extends SchemaFieldsHKT {
 *   readonly fields: 'archivable' extends keyof this['shape']
 *     ? Readonly<{ archivedAt: ForbiddenMutationInputField<typeof archivedAt> }>
 *     : unknown
 * }
 * ```
 */
export interface SchemaFieldsHKT {
	readonly shape: object
	readonly fields: unknown
}

/**
 * Higher-kinded slot through which one plugin adds static members, usually
 * commands, to a configured schema (ADR-0316). Core substitutes `shape` (as
 * for {@link SchemaFieldsHKT}) and `schema`, the configured schema class, and
 * reads `statics`; {@link SchemaCommands} types the commands.
 *
 * @example
 * ```ts
 * interface ArchiveStatics extends SchemaStaticsHKT {
 *   readonly statics: 'archivable' extends keyof this['shape']
 *     ? SchemaCommands<this['schema'], { archiveOne: typeof archiveMutation }>
 *     : unknown
 * }
 * ```
 */
export interface SchemaStaticsHKT {
	readonly shape: object
	readonly schema: unknown
	readonly statics: unknown
}

/** Source projection carrying one plugin's field slot. */
export type PluginSchemaFieldsSource<TFields extends SchemaFieldsHKT> =
	Readonly<{ shapeFields: TFields }>

/** Source projection carrying one plugin's statics slot. */
export type PluginSchemaStaticsSource<TStatics extends SchemaStaticsHKT> =
	Readonly<{ schemaStatics: TStatics }>

type ApplySchemaFields<TSlot, TShape> = TSlot extends SchemaFieldsHKT
	? (TSlot & { readonly shape: TShape })['fields']
	: unknown

type ApplySchemaStatics<TSlot, TShape, TSchema> = TSlot extends SchemaStaticsHKT
	? (TSlot & { readonly shape: TShape; readonly schema: TSchema })['statics']
	: unknown

/** Evaluates every installed field slot against one declaration shape. */
export type SchemaFieldsFor<TSlots, TShape> = TSlots extends readonly [
	infer TFirst,
	...infer TRest,
]
	? ApplySchemaFields<TFirst, TShape> & SchemaFieldsFor<TRest, TShape>
	: unknown

/** Evaluates every installed statics slot against one declaration and schema. */
export type SchemaStaticsFor<TSlots, TShape, TSchema> =
	TSlots extends readonly [infer TFirst, ...infer TRest]
		? ApplySchemaStatics<TFirst, TShape, TSchema> &
				SchemaStaticsFor<TRest, TShape, TSchema>
		: unknown

declare const declaredSchemaShapeType: unique symbol

/**
 * Records, in a declaration's options, the shape methods called on it and
 * their arguments; the field and statics slots read it as `shape`.
 */
export interface DeclaredSchemaShape<TShape extends object> {
	readonly [declaredSchemaShapeType]: TShape
}

/** Reads the shape record of one declaration's options (empty when none was called). */
export type SchemaShapeOf<TOptions> =
	TOptions extends DeclaredSchemaShape<infer TShape>
		? TShape
		: Readonly<Record<never, never>>

declare const shapeMethodArgumentsType: unique symbol
declare const shapeMethodOptionsType: unique symbol
declare const featureRequiredRulesType: unique symbol

/**
 * Describes one feature of a plugin: a key of `define` (`softDelete: { mode:
 * 'command' }`, ADR-0339) and, until the shape methods are removed, the
 * callback-free method of the same name chained before `.with(...)`. It never
 * sees the schema, so it cannot create an initializer cycle; its result is a
 * patch of ordinary declaration options that the installed plugins already
 * interpret (fields, selectors, storage). `TArguments` is `readonly []` for a
 * feature set with `true`, `readonly [options?: TValue]` for one that also
 * takes an options object. `TRequiredRules` names the rules a declaration
 * setting the feature must give in `.with((plugins) => …)`.
 */
export interface SchemaShapeMethod<
	TArguments extends readonly unknown[] = readonly [],
	TOptions extends object = Readonly<Record<never, never>>,
	TRequiredRules extends string = never,
> {
	readonly [shapeMethodArgumentsType]: TArguments
	readonly [shapeMethodOptionsType]: TOptions
	readonly [featureRequiredRulesType]: TRequiredRules
}

/**
 * Describes one feature of a plugin (ADR-0339), the key it adds to `define`.
 * The same contract as {@link SchemaShapeMethod}, under its new name.
 *
 * @example `SchemaFeature<readonly [], Readonly<{ acl: object }>, 'acl'>`
 */
export type SchemaFeature<
	TArguments extends readonly unknown[] = readonly [],
	TOptions extends object = Readonly<Record<never, never>>,
	TRequiredRules extends string = never,
> = SchemaShapeMethod<TArguments, TOptions, TRequiredRules>

/** Reads the rules one declared feature requires (`never` when none). */
export type SchemaFeatureRequiredRules<TFeature> =
	TFeature extends SchemaShapeMethod<
		readonly unknown[],
		object,
		infer TRequiredRules
	>
		? TRequiredRules
		: never

/** Source projection carrying one plugin's shape methods. */
export type PluginSchemaShapeSource<
	TMethods extends Readonly<
		Record<string, SchemaShapeMethod<readonly unknown[], object, string>>
	>,
> = Readonly<{ shapeMethods: TMethods }>

/**
 * Source projection carrying one plugin's features, the keys it adds to
 * `define` (ADR-0339).
 */
export type PluginSchemaFeatureSource<
	TFeatures extends Readonly<
		Record<string, SchemaShapeMethod<readonly unknown[], object, string>>
	>,
> = PluginSchemaShapeSource<TFeatures>

/** Reads the arguments accepted by one declared shape method. */
export type SchemaShapeMethodArguments<TMethod> =
	TMethod extends SchemaShapeMethod<infer TArguments, object, string>
		? TArguments
		: never

/** Reads the declaration options added by one declared shape method. */
export type SchemaShapeMethodOptions<TMethod> =
	TMethod extends SchemaShapeMethod<readonly unknown[], infer TOptions, string>
		? TOptions
		: never

type ApplySchemaRules<TRules, TSchema, TShape> = TRules extends SchemaRulesHKT
	? (TRules & { readonly schema: TSchema; readonly shape: TShape })['rules']
	: unknown

/**
 * Evaluates every installed rules slot against one schema reference. Slots are
 * accumulated as a tuple: intersecting `this`-typed interfaces directly makes
 * TypeScript give up with TS2589.
 */
export type SchemaRulesFor<
	TRulesList,
	TSchema,
	TShape = Readonly<Record<never, never>>,
> = TRulesList extends readonly [infer TFirst, ...infer TRest]
	? ApplySchemaRules<TFirst, TSchema, TShape> &
			SchemaRulesFor<TRest, TSchema, TShape>
	: unknown

type SourceShapeMethods<TSource> =
	TSource extends Readonly<{
		shapeMethods: infer TMethods
	}>
		? TMethods
		: never

type UnionToIntersection<TValue> = (
	TValue extends unknown ? (value: TValue) => void : never
) extends (value: infer TIntersection) => void
	? TIntersection
	: never

type DeclaredShapeMethods<TSource> = UnionToIntersection<
	SourceShapeMethods<TSource>
>

/** Runtime of one declared shape method. */
export interface SchemaShapeMethodImplementation<
	TArguments extends readonly unknown[] = readonly unknown[],
	TOptions extends object = object,
	TRequiredRules extends string = string,
> {
	/**
	 * Declaration option keys the method sets; the method is unavailable when a
	 * declaration already sets one of them.
	 */
	readonly sets: readonly (keyof TOptions & string)[]
	/** Returns the declaration options the method adds. */
	readonly apply: (...arguments_: TArguments) => TOptions
	/**
	 * Rules a declaration setting the feature in `define` must give in
	 * `.with((plugins) => …)`, as its source type declares them (ADR-0339).
	 * @example `requires: ['acl']`
	 */
	readonly requires?: readonly TRequiredRules[]
}

/** Runtime implementations matching the shape methods a plugin source declares. */
export type SchemaShapeMethodImplementations<TSource> = {
	readonly [
		TName in keyof DeclaredShapeMethods<TSource>
	]: SchemaShapeMethodImplementation<
		SchemaShapeMethodArguments<DeclaredShapeMethods<TSource>[TName]>,
		SchemaShapeMethodOptions<DeclaredShapeMethods<TSource>[TName]>,
		SchemaFeatureRequiredRules<DeclaredShapeMethods<TSource>[TName]>
	>
}

type RuntimeShapeMethod = Readonly<{
	sets: readonly string[]
	apply: (...arguments_: readonly unknown[]) => object
	requires: readonly string[]
}>

const shapeMethodsByPlugin = new WeakMap<
	PluginDefinition,
	Readonly<Record<string, RuntimeShapeMethod>>
>()

const readNameList = (value: unknown, message: string): readonly string[] => {
	if (value === undefined) return Object.freeze([])
	if (!Array.isArray(value) || value.some((key) => typeof key !== 'string')) {
		throw new TypeError(message)
	}
	return Object.freeze(value.map(String))
}

const snapshotShapeMethod = (
	name: string,
	value: unknown,
): RuntimeShapeMethod => {
	if (!isPlainRecord(value) || typeof value.apply !== 'function') {
		throw new TypeError(`schema shape method ${name} must define apply()`)
	}
	const sets: unknown = value.sets
	if (!Array.isArray(sets) || sets.some((key) => typeof key !== 'string')) {
		throw new TypeError(
			`schema shape method ${name} sets must list option keys`,
		)
	}
	const { apply } = value
	return immutableRecord({
		sets: Object.freeze(sets.map(String)),
		apply: (...arguments_: readonly unknown[]): object => {
			const options: unknown = Reflect.apply(apply, undefined, arguments_)
			if (!isPlainRecord(options)) {
				throw new TypeError(`schema shape method ${name} must return options`)
			}
			return options
		},
		requires: readNameList(
			value.requires,
			`schema feature ${name} requires must list rule names`,
		),
	})
}

/**
 * Attaches the runtime of the features one plugin declares in its source
 * type (ADR-0339): the keys it adds to `define`, and until their removal the
 * shape methods of the same names. Returns the same frozen plugin instance.
 *
 * @example `provideSchemaFeatures(instance, { archivable: { sets: ['archivable'], apply: (options = {}) => ({ archivable: options }) } })`
 */
export const provideSchemaFeatures = <
	TPlugin extends PluginDefinition,
	TSource = PluginSource<TPlugin>,
>(
	plugin: TPlugin,
	features: SchemaShapeMethodImplementations<TSource>,
): TPlugin => {
	const untrusted: unknown = features
	if (!isPlainRecord(untrusted)) {
		throw new TypeError('schema shape methods must be a plain object')
	}
	shapeMethodsByPlugin.set(
		plugin,
		immutableRecord(
			Object.fromEntries(
				Object.entries(untrusted).map(([name, value]) => [
					name,
					snapshotShapeMethod(name, value),
				]),
			),
		),
	)
	return plugin
}

/**
 * Attaches the runtime of the shape methods one plugin declares in its source
 * type. Returns the same frozen plugin instance.
 *
 * @deprecated Use {@link provideSchemaFeatures} (ADR-0339); this name is
 * removed with the shape methods.
 * @example `provideSchemaShapeMethods(instance, { archivable: { sets: ['archivable'], apply: (options = {}) => ({ archivable: options }) } })`
 */
export const provideSchemaShapeMethods: typeof provideSchemaFeatures =
	provideSchemaFeatures

/** One collected runtime shape method. */
export type SchemaShapeMethodRuntime = RuntimeShapeMethod

/**
 * @internal Collects the shape methods of one installed plugin tuple. Several
 * instances of one plugin declare the same method: the first one is kept, and
 * methods setting different options under one name are rejected. A feature
 * named after a reserved key (ADR-0339) is rejected.
 */
export const readSchemaShapeMethods = (
	plugins: readonly PluginDefinition[],
): ReadonlyMap<string, SchemaShapeMethodRuntime> => {
	const methods = new Map<string, SchemaShapeMethodRuntime>()
	for (const plugin of plugins) {
		for (const [name, method] of Object.entries(
			shapeMethodsByPlugin.get(plugin) ?? {},
		)) {
			assertUnreservedSchemaKey('feature', name)
			const existing = methods.get(name)
			if (existing === undefined) methods.set(name, method)
			else if (existing.sets.join() !== method.sets.join()) {
				throw new TypeError(`Conflicting schema shape method: ${name}`)
			}
		}
	}
	return methods
}
