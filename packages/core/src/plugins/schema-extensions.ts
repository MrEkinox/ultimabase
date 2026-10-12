import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { PluginDefinition, PluginSource } from './definition.js'

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

/**
 * Describes one callback-free shape method chained before `.with(...)`, such
 * as `.softDelete()`. It never sees the schema, so it cannot create an
 * initializer cycle; its result is a patch of ordinary declaration options
 * that the installed plugins already interpret (fields, selectors, storage).
 */
export interface SchemaShapeMethod<
	TArguments extends readonly unknown[] = readonly [],
	TOptions extends object = Readonly<Record<never, never>>,
> {
	readonly [shapeMethodArgumentsType]: TArguments
	readonly [shapeMethodOptionsType]: TOptions
}

/** Source projection carrying one plugin's shape methods. */
export type PluginSchemaShapeSource<
	TMethods extends Readonly<
		Record<string, SchemaShapeMethod<readonly unknown[], object>>
	>,
> = Readonly<{ shapeMethods: TMethods }>

/** Reads the arguments accepted by one declared shape method. */
export type SchemaShapeMethodArguments<TMethod> =
	TMethod extends SchemaShapeMethod<infer TArguments, object>
		? TArguments
		: never

/** Reads the declaration options added by one declared shape method. */
export type SchemaShapeMethodOptions<TMethod> =
	TMethod extends SchemaShapeMethod<readonly unknown[], infer TOptions>
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
> {
	/**
	 * Declaration option keys the method sets; the method is unavailable when a
	 * declaration already sets one of them.
	 */
	readonly sets: readonly (keyof TOptions & string)[]
	/** Returns the declaration options the method adds. */
	readonly apply: (...arguments_: TArguments) => TOptions
}

/** Runtime implementations matching the shape methods a plugin source declares. */
export type SchemaShapeMethodImplementations<TSource> = {
	readonly [
		TName in keyof DeclaredShapeMethods<TSource>
	]: SchemaShapeMethodImplementation<
		SchemaShapeMethodArguments<DeclaredShapeMethods<TSource>[TName]>,
		SchemaShapeMethodOptions<DeclaredShapeMethods<TSource>[TName]>
	>
}

type RuntimeShapeMethod = Readonly<{
	sets: readonly string[]
	apply: (...arguments_: readonly unknown[]) => object
}>

const shapeMethodsByPlugin = new WeakMap<
	PluginDefinition,
	Readonly<Record<string, RuntimeShapeMethod>>
>()

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
	})
}

/**
 * Attaches the runtime of the shape methods one plugin declares in its source
 * type. Returns the same frozen plugin instance.
 *
 * @example `provideSchemaShapeMethods(instance, { archivable: { sets: ['archivable'], apply: (options = {}) => ({ archivable: options }) } })`
 */
export const provideSchemaShapeMethods = <
	TPlugin extends PluginDefinition,
	TSource = PluginSource<TPlugin>,
>(
	plugin: TPlugin,
	methods: SchemaShapeMethodImplementations<TSource>,
): TPlugin => {
	const untrusted: unknown = methods
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

/** One collected runtime shape method. */
export type SchemaShapeMethodRuntime = RuntimeShapeMethod

/**
 * @internal Collects the shape methods of one installed plugin tuple. Several
 * instances of one plugin declare the same method: the first one is kept, and
 * methods setting different options under one name are rejected.
 */
export const readSchemaShapeMethods = (
	plugins: readonly PluginDefinition[],
): ReadonlyMap<string, SchemaShapeMethodRuntime> => {
	const methods = new Map<string, SchemaShapeMethodRuntime>()
	for (const plugin of plugins) {
		for (const [name, method] of Object.entries(
			shapeMethodsByPlugin.get(plugin) ?? {},
		)) {
			const existing = methods.get(name)
			if (existing === undefined) methods.set(name, method)
			else if (existing.sets.join() !== method.sets.join()) {
				throw new TypeError(`Conflicting schema shape method: ${name}`)
			}
		}
	}
	return methods
}
