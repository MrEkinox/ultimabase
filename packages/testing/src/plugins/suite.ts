import type { PluginDefinition, SchemaDefinition } from '@ultimabase/core'
import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type {
	OptionalPluginConformanceContract,
	PluginConformanceExpected,
} from './contracts.js'
import type {
	PluginConformanceFixture,
	PluginConformanceUltimaBaseFixture,
} from './fixture.js'

/** Configures two explicit instances of one plugin factory. */
export interface PluginConformanceInstanceFactory {
	/** Two distinct expected application-local instance IDs. */
	readonly instanceIds: readonly [string, string]
	/** Creates one definition using the exact supplied identity. */
	readonly create: (instanceId: string) => PluginDefinition
}

/** Gives optional checks fresh public applications. */
export interface PluginConformanceContext<
	TSubject extends PluginDefinition,
	TSupport extends readonly PluginDefinition[],
	TSchemas extends readonly SchemaDefinition[],
> {
	/** Creates an unstarted application tracked for automatic disposal. */
	readonly createUltimaBase: () => PluginConformanceUltimaBaseFixture<
		TSubject,
		TSupport,
		TSchemas
	>
}

/** Implements one optional domain check through public APIs only. */
export type PluginConformanceVerifier<
	TSubject extends PluginDefinition,
	TSupport extends readonly PluginDefinition[],
	TSchemas extends readonly SchemaDefinition[],
> = (
	context: PluginConformanceContext<TSubject, TSupport, TSchemas>,
) => Promise<void> | void

/** Retains one optional named verification without coupling to a test runner. */
export interface PluginConformanceCheck<
	TSubject extends PluginDefinition,
	TSupport extends readonly PluginDefinition[],
	TSchemas extends readonly SchemaDefinition[],
> {
	readonly contract: OptionalPluginConformanceContract
	readonly verify: PluginConformanceVerifier<TSubject, TSupport, TSchemas>
}

/** Configures the common suite while preserving the exact fixture tuple. */
export interface DefinePluginConformanceSuiteOptions<
	TSubject extends PluginDefinition,
	TSupport extends readonly PluginDefinition[],
	TSchemas extends readonly SchemaDefinition[],
	TPluginId extends string,
	TVersion extends string,
	TCoreRange extends string,
> {
	/** Returns a fresh subject, support graph, and schemas for every check. */
	readonly createFixture: () => PluginConformanceFixture<
		TSubject,
		TSupport,
		TSchemas
	>
	/** Protects stable package facts independently from the factory implementation. */
	readonly expected: PluginConformanceExpected<TPluginId, TVersion, TCoreRange>
	/** Enables the structured two-instance identity contract when supported. */
	readonly instances?: PluginConformanceInstanceFactory
}

const optionalContracts: ReadonlySet<OptionalPluginConformanceContract> =
	new Set([
		'adapter-failure',
		'codec',
		'javascript-operation',
		'middleware',
		'migration',
		'operation',
		'persistence',
		'relation-read',
		'schema-mutation',
		'schema-surface',
		'transport',
		'typegen',
	])

const assertExpected = (expected: unknown): void => {
	if (!isPlainRecord(expected)) {
		throw new TypeError(
			'plugin conformance expected facts must be a plain object',
		)
	}
	assertNonEmptyString(expected.pluginId, 'plugin conformance pluginId')
	assertNonEmptyString(expected.version, 'plugin conformance version')
	assertNonEmptyString(expected.core, 'plugin conformance Core range')
}

const snapshotExpected = <
	TPluginId extends string,
	TVersion extends string,
	TCoreRange extends string,
>(
	expected: PluginConformanceExpected<TPluginId, TVersion, TCoreRange>,
): PluginConformanceExpected<TPluginId, TVersion, TCoreRange> =>
	immutableRecord({
		core: expected.core,
		...(expected.environment === undefined
			? {}
			: { environment: immutableArray(expected.environment) }),
		pluginId: expected.pluginId,
		...(expected.privileges === undefined
			? {}
			: { privileges: immutableArray(expected.privileges) }),
		version: expected.version,
	})

const snapshotInstances = (
	instances: PluginConformanceInstanceFactory | undefined,
): PluginConformanceInstanceFactory | undefined => {
	if (instances === undefined) return undefined
	if (!isPlainRecord(instances) || typeof instances.create !== 'function') {
		throw new TypeError('plugin conformance instances must expose create')
	}
	const [first, second] = instances.instanceIds
	assertNonEmptyString(first, 'plugin conformance first instanceId')
	assertNonEmptyString(second, 'plugin conformance second instanceId')
	if (first === second) {
		throw new TypeError('plugin conformance instanceIds must be distinct')
	}

	return immutableRecord({
		create: instances.create,
		instanceIds: immutableArray(instances.instanceIds),
	})
}

/**
 * Immutable runner-agnostic definition for the public plugin conformance suite.
 * Every `check` call returns a new suite and keeps exact fixture inference.
 */
export class PluginConformanceSuite<
	TSubject extends PluginDefinition,
	TSupport extends readonly PluginDefinition[],
	TSchemas extends readonly SchemaDefinition[],
> {
	readonly createFixture: () => PluginConformanceFixture<
		TSubject,
		TSupport,
		TSchemas
	>
	readonly expected: PluginConformanceExpected
	readonly instances: PluginConformanceInstanceFactory | undefined
	readonly checks: readonly PluginConformanceCheck<
		TSubject,
		TSupport,
		TSchemas
	>[]

	/** Creates a validated suite; prefer `definePluginConformanceSuite` for inference. */
	constructor(
		createFixture: () => PluginConformanceFixture<TSubject, TSupport, TSchemas>,
		expected: PluginConformanceExpected,
		instances: PluginConformanceInstanceFactory | undefined,
		checks: readonly PluginConformanceCheck<
			TSubject,
			TSupport,
			TSchemas
		>[] = [],
	) {
		if (typeof createFixture !== 'function') {
			throw new TypeError('plugin conformance createFixture must be a function')
		}
		assertExpected(expected)
		const contracts = new Set<OptionalPluginConformanceContract>()
		for (const check of checks) {
			if (!optionalContracts.has(check.contract)) {
				throw new TypeError(
					`Unknown optional conformance contract: ${check.contract}`,
				)
			}
			if (typeof check.verify !== 'function') {
				throw new TypeError('plugin conformance verifier must be a function')
			}
			if (contracts.has(check.contract)) {
				throw new TypeError(
					`Duplicate optional conformance contract: ${check.contract}`,
				)
			}
			contracts.add(check.contract)
		}
		this.createFixture = createFixture
		this.expected = snapshotExpected(expected)
		this.instances = snapshotInstances(instances)
		this.checks = immutableArray(
			checks.map(({ contract, verify }) =>
				immutableRecord({ contract, verify }),
			),
		)
		Object.freeze(this)
	}

	/** Adds one named domain invariant without hiding its test implementation. */
	check(
		contract: OptionalPluginConformanceContract,
		verify: PluginConformanceVerifier<TSubject, TSupport, TSchemas>,
	): PluginConformanceSuite<TSubject, TSupport, TSchemas> {
		if (!optionalContracts.has(contract)) {
			throw new TypeError(`Unknown optional conformance contract: ${contract}`)
		}
		if (typeof verify !== 'function') {
			throw new TypeError('plugin conformance verifier must be a function')
		}
		if (this.checks.some((check) => check.contract === contract)) {
			throw new TypeError(
				`Duplicate optional conformance contract: ${contract}`,
			)
		}

		return new PluginConformanceSuite(
			this.createFixture,
			this.expected,
			this.instances,
			[...this.checks, immutableRecord({ contract, verify })],
		)
	}
}

/**
 * Defines the common kernel suite without importing Vitest or another runner.
 *
 * @example
 * ```ts
 * const suite = definePluginConformanceSuite({
 *   expected: { pluginId: 'community.workflow', version: '1.0.0', core: '^1.0.0' },
 *   createFixture: () => createPluginConformanceFixture({ subject: workflowPlugin() }),
 * })
 * ```
 */
export const definePluginConformanceSuite = <
	const TSubject extends PluginDefinition,
	const TSupport extends readonly PluginDefinition[],
	const TSchemas extends readonly SchemaDefinition[],
	const TPluginId extends string,
	const TVersion extends string,
	const TCoreRange extends string,
>(
	options: DefinePluginConformanceSuiteOptions<
		TSubject,
		TSupport,
		TSchemas,
		TPluginId,
		TVersion,
		TCoreRange
	>,
): PluginConformanceSuite<TSubject, TSupport, TSchemas> => {
	const untrustedOptions: unknown = options
	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('plugin conformance suite must be a plain object')
	}
	if (typeof options.createFixture !== 'function') {
		throw new TypeError('plugin conformance createFixture must be a function')
	}
	assertExpected(options.expected)

	return new PluginConformanceSuite(
		options.createFixture,
		options.expected,
		options.instances,
	)
}
