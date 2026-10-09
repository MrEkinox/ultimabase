import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { PluginDefinition, PluginSource } from './definition.js'

/**
 * Higher-kinded slot through which one plugin contributes rule entries to the
 * final `.with({ ... })` call of a schema declaration. Core substitutes the
 * schema reference into `schema` and reads `rules`; it never names a plugin.
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
	readonly rules: object
}

/** Source projection carrying one plugin's rule entries for `.with({ ... })`. */
export type PluginSchemaRulesSource<TRules extends SchemaRulesHKT> = Readonly<{
	schemaRules: TRules
}>

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
	TMethods extends Readonly<Record<string, SchemaShapeMethod>>,
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

type ApplySchemaRules<TRules, TSchema> = TRules extends SchemaRulesHKT
	? (TRules & { readonly schema: TSchema })['rules']
	: unknown

/**
 * Evaluates every installed rules slot against one schema reference. Slots are
 * accumulated as a tuple: intersecting `this`-typed interfaces directly makes
 * TypeScript give up with TS2589.
 */
export type SchemaRulesFor<TRulesList, TSchema> = TRulesList extends readonly [
	infer TFirst,
	...infer TRest,
]
	? ApplySchemaRules<TFirst, TSchema> & SchemaRulesFor<TRest, TSchema>
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
 * @example `provideSchemaShapeMethods(instance, { softDelete: { sets: ['softDelete'], apply: () => ({ softDelete: 'replace-delete' }) } })`
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

/** @internal Collects shape methods of an installed plugin tuple; names must be unique. */
export const readSchemaShapeMethods = (
	plugins: readonly PluginDefinition[],
): ReadonlyMap<string, SchemaShapeMethodRuntime> => {
	const methods = new Map<string, SchemaShapeMethodRuntime>()
	for (const plugin of plugins) {
		for (const [name, method] of Object.entries(
			shapeMethodsByPlugin.get(plugin) ?? {},
		)) {
			if (methods.has(name)) {
				throw new TypeError(`Duplicate schema shape method: ${name}`)
			}
			methods.set(name, method)
		}
	}
	return methods
}
