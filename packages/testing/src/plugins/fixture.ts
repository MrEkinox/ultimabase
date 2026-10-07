import type {
	UltimaBase,
	PluginDefinition,
	SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

/** Holds one fresh subject plus every public dependency needed to assemble it. */
export interface PluginConformanceFixture<
	TSubject extends PluginDefinition = PluginDefinition,
	TSupport extends readonly PluginDefinition[] = readonly PluginDefinition[],
	TSchemas extends readonly SchemaDefinition[] = readonly SchemaDefinition[],
> {
	readonly plugins: readonly [...TSupport, TSubject]
	readonly schemas: TSchemas
	readonly subject: TSubject
	readonly supportPlugins: TSupport
}

/** Configures one isolated plugin fixture without choosing a test runner. */
export interface CreatePluginConformanceFixtureOptions<
	TSubject extends PluginDefinition,
	TSupport extends readonly PluginDefinition[] = readonly [],
	TSchemas extends readonly SchemaDefinition[] = readonly [],
> {
	/** Plugin definition whose public contract is under test. */
	readonly subject: TSubject
	/** Fresh schemas used by this application only. */
	readonly schemas?: TSchemas
	/** Providers or named dependencies required by the subject. */
	readonly supportPlugins?: TSupport
}

/** Adds the complete application created from one exact inferred fixture. */
export type PluginConformanceUltimaBaseFixture<
	TSubject extends PluginDefinition,
	TSupport extends readonly PluginDefinition[],
	TSchemas extends readonly SchemaDefinition[],
> = PluginConformanceFixture<TSubject, TSupport, TSchemas> &
	Readonly<{
		ultimabase: UltimaBase<TSchemas, readonly [...TSupport, TSubject]>
	}>

/**
 * Creates one immutable, precisely inferred application fixture.
 *
 * @example
 * ```ts
 * createPluginConformanceFixture({
 *   subject: workflowPlugin(),
 *   schemas: [PostSchema],
 * })
 * ```
 */
export const createPluginConformanceFixture = <
	const TSubject extends PluginDefinition,
	const TSupport extends readonly PluginDefinition[] = readonly [],
	const TSchemas extends readonly SchemaDefinition[] = readonly [],
>(
	options: CreatePluginConformanceFixtureOptions<TSubject, TSupport, TSchemas>,
): PluginConformanceFixture<TSubject, TSupport, TSchemas> => {
	if (!isPlainRecord(options)) {
		throw new TypeError('plugin conformance fixture must be a plain object')
	}
	if (
		!isPlainRecord(options.subject) ||
		!isPlainRecord(options.subject.manifest)
	) {
		throw new TypeError('plugin conformance fixture subject must be a plugin')
	}
	const configuredSchemas = options.schemas ?? ([] as unknown as TSchemas)
	if (!isUnknownArray(configuredSchemas)) {
		throw new TypeError('plugin conformance fixture schemas must be an array')
	}
	const supportPlugins = options.supportPlugins ?? ([] as unknown as TSupport)
	if (!isUnknownArray(supportPlugins)) {
		throw new TypeError(
			'plugin conformance fixture supportPlugins must be an array',
		)
	}
	if (supportPlugins.some((plugin) => plugin === options.subject)) {
		throw new TypeError(
			'plugin conformance fixture cannot repeat its subject as support',
		)
	}

	const schemas = immutableArray(configuredSchemas) as unknown as TSchemas
	const support = immutableArray(supportPlugins) as unknown as TSupport
	return immutableRecord({
		plugins: immutableArray([...support, options.subject]),
		schemas,
		subject: options.subject,
		supportPlugins: support,
	})
}

/** @internal Re-snapshots fixtures returned by untyped JavaScript factories. */
export const normalizePluginConformanceFixture = <
	TSubject extends PluginDefinition,
	TSupport extends readonly PluginDefinition[],
	TSchemas extends readonly SchemaDefinition[],
>(
	fixture: PluginConformanceFixture<TSubject, TSupport, TSchemas>,
): PluginConformanceFixture<TSubject, TSupport, TSchemas> =>
	createPluginConformanceFixture({
		schemas: fixture.schemas,
		subject: fixture.subject,
		supportPlugins: fixture.supportPlugins,
	})
