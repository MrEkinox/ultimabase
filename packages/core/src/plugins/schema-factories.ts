import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { SchemaDefinition } from '../schema/schema/definition.js'
import type { PluginDefinition, PluginSource } from './definition.js'

/**
 * Higher-kinded slot through which one plugin adds schema factories to the
 * configured application, such as `App.AuditSchema` (ADR-0297, ADR-0322). Core
 * substitutes `source`, the plugin source state of the configured factory, and
 * reads `factories`; it never names a plugin.
 *
 * @example
 * ```ts
 * interface AuditFactories extends SchemaFactoriesHKT {
 *   readonly factories: Readonly<{ AuditSchema: AuditSchemaFactory<this['source']> }>
 * }
 * ```
 */
export interface SchemaFactoriesHKT {
	readonly source: unknown
	readonly factories: object
}

/** Source projection carrying one plugin's schema factories. */
export type PluginSchemaFactoriesSource<TFactories extends SchemaFactoriesHKT> =
	Readonly<{ schemaFactories: TFactories }>

type ApplySchemaFactories<TSlot, TSource> = TSlot extends SchemaFactoriesHKT
	? (TSlot & { readonly source: TSource })['factories']
	: unknown

/** Evaluates every installed factories slot against one configured source. */
export type SchemaFactoriesFor<TSlots, TSource> = TSlots extends readonly [
	infer TFirst,
	...infer TRest,
]
	? ApplySchemaFactories<TFirst, TSource> & SchemaFactoriesFor<TRest, TSource>
	: unknown

/**
 * The shape record a schema factory starts its declarations with, so the
 * factory's statics slot recognizes them (`'AuditSchema' extends keyof
 * this['shape']`).
 *
 * @example `DeclaredSchemaShape<SchemaFactoryShape<'AuditSchema'>>`
 */
export type SchemaFactoryShape<TName extends string> = Readonly<
	Record<TName, readonly []>
>

/** Given to one schema factory when Core attaches it to a configured application. */
export interface SchemaFactoryContext {
	/**
	 * Starts one generation-free declaration (ADR-0297) through the configured
	 * application's schema namespace, so the installed shape methods and the
	 * final `.with(...)` stay available. `statics` runs for every class of the
	 * chain, the final `.with(...)` result included, and returns the static
	 * members that class gains.
	 *
	 * @example `define(options, (schema) => ({ entry: (name: string) => createReference(schema, name) }))`
	 */
	readonly define: (
		options: object,
		statics?: (schema: SchemaDefinition) => Readonly<Record<string, unknown>>,
	) => unknown
}

/** Runtime of the schema factories one plugin declares, keyed by factory name. */
export type SchemaFactoryImplementations = Readonly<
	Record<string, (context: SchemaFactoryContext) => object>
>

const factoriesByPlugin = new WeakMap<
	PluginDefinition,
	SchemaFactoryImplementations
>()
const factoryNamePattern = /^[A-Z][A-Za-z0-9]*$/u
const reservedFactoryNames: ReadonlySet<string> = new Set(['Schema'])

/**
 * Attaches the runtime of the schema factories one plugin declares in its
 * source type. Returns the same frozen plugin instance. Names are PascalCase
 * and `Schema` is reserved.
 *
 * @example `provideSchemaFactories(instance, { AuditSchema: ({ define }) => ({ define: (options) => define(options) }) })`
 */
export const provideSchemaFactories = <
	TPlugin extends PluginDefinition,
	TSource = PluginSource<TPlugin>,
>(
	plugin: TPlugin,
	factories: SchemaFactoryImplementationsOf<TSource>,
): TPlugin => {
	const untrusted: unknown = factories
	if (!isPlainRecord(untrusted)) {
		throw new TypeError('schema factories must be a plain object')
	}
	for (const [name, create] of Object.entries(untrusted)) {
		if (!factoryNamePattern.test(name) || reservedFactoryNames.has(name)) {
			throw new TypeError(`Invalid schema factory name: ${name}`)
		}
		if (typeof create !== 'function') {
			throw new TypeError(`schema factory ${name} must be a function`)
		}
	}
	factoriesByPlugin.set(
		plugin,
		immutableRecord({ ...(untrusted as SchemaFactoryImplementations) }),
	)
	return plugin
}

type SourceFactorySlot<TSource> =
	TSource extends Readonly<{ schemaFactories: infer TSlot }> ? TSlot : never

type FactoryNames<TSource> =
	keyof (SourceFactorySlot<TSource> extends infer TSlot
		? TSlot extends SchemaFactoriesHKT
			? TSlot['factories']
			: never
		: never)

/** Runtime implementations matching the schema factories a plugin source declares. */
export type SchemaFactoryImplementationsOf<TSource> = Readonly<
	Record<
		FactoryNames<TSource> & string,
		(context: SchemaFactoryContext) => object
	>
>

/**
 * @internal Collects the schema factories of one installed plugin tuple. Two
 * plugins declaring one factory name are rejected; several instances of the
 * same plugin share the first one.
 */
export const readSchemaFactories = (
	plugins: readonly PluginDefinition[],
): ReadonlyMap<string, (context: SchemaFactoryContext) => object> => {
	const factories = new Map<string, (context: SchemaFactoryContext) => object>()
	const owners = new Map<string, string>()
	for (const plugin of plugins) {
		const pluginId = plugin.manifest.identity.pluginId
		for (const [name, create] of Object.entries(
			factoriesByPlugin.get(plugin) ?? {},
		)) {
			const owner = owners.get(name)
			if (owner === undefined) {
				factories.set(name, create)
				owners.set(name, pluginId)
			} else if (owner !== pluginId) {
				throw new TypeError(`Conflicting schema factory: ${name}`)
			}
		}
	}
	return factories
}
