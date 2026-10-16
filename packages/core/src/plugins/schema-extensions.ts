import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { PluginDefinition, PluginSource } from './definition.js'
import { assertUnreservedSchemaKey } from './schema-rule-names.js'

/**
 * Higher-kinded slot through which one plugin contributes rule entries to the
 * final `.with({ … })` call of a schema declaration. Core substitutes the
 * schema reference into `schema` and the features its `define` sets into
 * `shape` (`{ acl: readonly [] }`, so a rule can depend on a feature), and
 * reads `rules`; it never names a plugin.
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

/** Source projection carrying one plugin's rule entries for `.with({ … })`. */
export type PluginSchemaRulesSource<TRules extends SchemaRulesHKT> = Readonly<{
	schemaRules: TRules
}>

/**
 * Higher-kinded slot through which one plugin adds fields to a schema from the
 * features its `define` sets (ADR-0316, ADR-0339). Core substitutes `shape`,
 * the record of those features and their options
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
 * Records, in a declaration's options, the features its `define` sets and
 * their options; the field, statics and rules slots read it as `shape`.
 */
export interface DeclaredSchemaShape<TShape extends object> {
	readonly [declaredSchemaShapeType]: TShape
}

/** Reads the shape record of one declaration's options (empty without features). */
export type SchemaShapeOf<TOptions> =
	TOptions extends DeclaredSchemaShape<infer TShape>
		? TShape
		: Readonly<Record<never, never>>

declare const featureArgumentsType: unique symbol
declare const featureOptionsType: unique symbol
declare const featureRequiredRulesType: unique symbol

/**
 * Describes one feature of a plugin: a key of `define` (`softDelete: { mode:
 * 'command' }`, ADR-0339). It is static and never sees the schema, so it
 * cannot create an initializer cycle; its result is a patch of ordinary
 * declaration options that the installed plugins already interpret (fields,
 * selectors, storage). `TArguments` is `readonly []` for a feature set with
 * `true`, `readonly [options?: TValue]` for one that also takes an options
 * object. `TRequiredRules` names the rules a declaration setting the feature
 * must give in `.with({ … })`.
 *
 * @example `SchemaFeature<readonly [], Readonly<{ acl: object }>, 'acl'>`
 */
export interface SchemaFeature<
	TArguments extends readonly unknown[] = readonly [],
	TOptions extends object = Readonly<Record<never, never>>,
	TRequiredRules extends string = never,
> {
	readonly [featureArgumentsType]: TArguments
	readonly [featureOptionsType]: TOptions
	readonly [featureRequiredRulesType]: TRequiredRules
}

/** Reads the rules one declared feature requires (`never` when none). */
export type SchemaFeatureRequiredRules<TFeature> =
	TFeature extends SchemaFeature<
		readonly unknown[],
		object,
		infer TRequiredRules
	>
		? TRequiredRules
		: never

/**
 * Source projection carrying one plugin's features, the keys it adds to
 * `define` (ADR-0339).
 */
export type PluginSchemaFeatureSource<
	TFeatures extends Readonly<
		Record<string, SchemaFeature<readonly unknown[], object, string>>
	>,
> = Readonly<{ features: TFeatures }>

/** Reads the arguments one declared feature accepts. */
export type SchemaFeatureArguments<TFeature> =
	TFeature extends SchemaFeature<infer TArguments, object, string>
		? TArguments
		: never

/** Reads the declaration options one declared feature adds. */
export type SchemaFeatureOptions<TFeature> =
	TFeature extends SchemaFeature<readonly unknown[], infer TOptions, string>
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

type SourceFeatures<TSource> =
	TSource extends Readonly<{
		features: infer TFeatures
	}>
		? TFeatures
		: never

type UnionToIntersection<TValue> = (
	TValue extends unknown ? (value: TValue) => void : never
) extends (value: infer TIntersection) => void
	? TIntersection
	: never

type DeclaredFeatures<TSource> = UnionToIntersection<SourceFeatures<TSource>>

/** Runtime of one declared feature. */
export interface SchemaFeatureImplementation<
	TArguments extends readonly unknown[] = readonly unknown[],
	TOptions extends object = object,
	TRequiredRules extends string = string,
> {
	/**
	 * Declaration option keys the feature sets. Two installed plugins may
	 * declare one feature only if it sets the same keys.
	 */
	readonly sets: readonly (keyof TOptions & string)[]
	/** Returns the declaration options the feature adds. */
	readonly apply: (...arguments_: TArguments) => TOptions
	/**
	 * Rules a declaration setting the feature in `define` must give in
	 * `.with({ … })`, as its source type declares them (ADR-0339).
	 * @example `requires: ['acl']`
	 */
	readonly requires?: readonly TRequiredRules[]
}

/** Runtime implementations matching the features a plugin source declares. */
export type SchemaFeatureImplementations<TSource> = {
	readonly [
		TName in keyof DeclaredFeatures<TSource>
	]: SchemaFeatureImplementation<
		SchemaFeatureArguments<DeclaredFeatures<TSource>[TName]>,
		SchemaFeatureOptions<DeclaredFeatures<TSource>[TName]>,
		SchemaFeatureRequiredRules<DeclaredFeatures<TSource>[TName]>
	>
}

/** One collected runtime feature. */
export type SchemaFeatureRuntime = Readonly<{
	sets: readonly string[]
	apply: (...arguments_: readonly unknown[]) => object
	requires: readonly string[]
}>

const featuresByPlugin = new WeakMap<
	PluginDefinition,
	Readonly<Record<string, SchemaFeatureRuntime>>
>()

const readNameList = (value: unknown, message: string): readonly string[] => {
	if (value === undefined) return Object.freeze([])
	if (!Array.isArray(value) || value.some((key) => typeof key !== 'string')) {
		throw new TypeError(message)
	}
	return Object.freeze(value.map(String))
}

const snapshotFeature = (
	name: string,
	value: unknown,
): SchemaFeatureRuntime => {
	if (!isPlainRecord(value) || typeof value.apply !== 'function') {
		throw new TypeError(`schema feature ${name} must define apply()`)
	}
	const sets: unknown = value.sets
	if (!Array.isArray(sets) || sets.some((key) => typeof key !== 'string')) {
		throw new TypeError(`schema feature ${name} sets must list option keys`)
	}
	const { apply } = value
	return immutableRecord({
		sets: Object.freeze(sets.map(String)),
		apply: (...arguments_: readonly unknown[]): object => {
			const options: unknown = Reflect.apply(apply, undefined, arguments_)
			if (!isPlainRecord(options)) {
				throw new TypeError(`schema feature ${name} must return options`)
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
 * type (ADR-0339): the keys it adds to `define`. Returns the same frozen
 * plugin instance.
 *
 * @example `provideSchemaFeatures(instance, { archivable: { sets: ['archivable'], apply: (options = {}) => ({ archivable: options }) } })`
 */
export const provideSchemaFeatures = <
	TPlugin extends PluginDefinition,
	TSource = PluginSource<TPlugin>,
>(
	plugin: TPlugin,
	features: SchemaFeatureImplementations<TSource>,
): TPlugin => {
	const untrusted: unknown = features
	if (!isPlainRecord(untrusted)) {
		throw new TypeError('schema features must be a plain object')
	}
	featuresByPlugin.set(
		plugin,
		immutableRecord(
			Object.fromEntries(
				Object.entries(untrusted).map(([name, value]) => [
					name,
					snapshotFeature(name, value),
				]),
			),
		),
	)
	return plugin
}

/**
 * @internal Collects the features of one installed plugin tuple. Several
 * instances of one plugin declare the same feature: the first one is kept,
 * and features setting different options under one name are rejected. A
 * feature named after a reserved key (ADR-0339) is rejected.
 */
export const readSchemaFeatures = (
	plugins: readonly PluginDefinition[],
): ReadonlyMap<string, SchemaFeatureRuntime> => {
	const features = new Map<string, SchemaFeatureRuntime>()
	for (const plugin of plugins) {
		for (const [name, feature] of Object.entries(
			featuresByPlugin.get(plugin) ?? {},
		)) {
			assertUnreservedSchemaKey('feature', name)
			const existing = features.get(name)
			if (existing === undefined) features.set(name, feature)
			else if (existing.sets.join() !== feature.sets.join()) {
				throw new TypeError(`Conflicting schema feature: ${name}`)
			}
		}
	}
	return features
}
