import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'
import { assertExactEnumerableKeys } from '../exact-object-validation.js'

import { FrameworkError } from '../errors/framework-error.js'

declare const databaseConstraintCompilerType: unique symbol

/** Describes the immutable identity claimed by one adapter-specific compiler. */
export interface DatabaseConstraintCompilerDefinition<
	TAdapter extends string = string,
	TKind extends string = string,
	TVersion extends number = number,
> {
	/** Selects the database adapter family that can execute this compiler. */
	readonly adapter: TAdapter
	/** Matches the lowercase namespaced kind carried by a constraint node. */
	readonly kind: TKind
	/** Selects one explicit payload contract version. */
	readonly version: TVersion
	// The required private brand rejects structural lookalikes before runtime validation.
	readonly [databaseConstraintCompilerType]: true
}

/** Configures one protected compiler identity without accepting plugin provenance. */
export interface DefineDatabaseConstraintCompilerOptions<
	TAdapter extends string,
	TKind extends string,
	TVersion extends number,
> {
	/** Stable lowercase adapter family, for example `postgres`. */
	readonly adapter: TAdapter
	/** Lowercase dot-separated constraint kind, for example `tenant.rows`. */
	readonly kind: TKind
	/** Positive safe integer identifying the payload contract. */
	readonly version: TVersion
}

/** Retains owner-derived metadata for an adapter reading completed setup state. */
export interface DatabaseConstraintCompilerContribution {
	readonly definition: DatabaseConstraintCompilerDefinition
	readonly ownerPlugin: string
}

/** Reads owner-attributed compiler identities without exposing registration. */
export interface DatabaseConstraintCompilerReader {
	readonly size: number
	/** Reads an immutable application-local snapshot in registration order. */
	values(): readonly DatabaseConstraintCompilerContribution[]
}

/** Registers compiler identities while setup binds ownership to the current plugin. */
export interface PluginConstraintCompilerRegistry extends DatabaseConstraintCompilerReader {
	/** Registers one adapter-created compiler definition exactly once. */
	register(definition: DatabaseConstraintCompilerDefinition): void
}

interface StoredConstraintCompilerContribution {
	readonly ownerPlugin: string
	readonly value: unknown
}

interface CreatePluginConstraintCompilerRegistryOptions {
	readonly assertPrivilege: () => void
	readonly isOpen: () => boolean
	readonly ownerPlugin: string
	readonly register: (name: string, value: unknown) => void
	readonly values: () => readonly StoredConstraintCompilerContribution[]
}

const definitionOptionKeys = new Set(['adapter', 'kind', 'version'])
const adapterPattern = /^[a-z][a-z0-9-]*$/u
const constraintKindPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u
const definitions = new WeakSet<object>()

/** Keeps node and compiler factories aligned on one namespaced-kind grammar. */
export const assertDatabaseConstraintKind: (
	value: unknown,
	path: string,
) => asserts value is string = (value, path) => {
	assertNonEmptyString(value, path)

	if (!constraintKindPattern.test(value)) {
		throw new TypeError(
			`${path} must use lowercase dot-separated namespace segments`,
		)
	}
}

/** Keeps node and compiler identities aligned on one version contract. */
export const assertDatabaseConstraintVersion: (
	value: unknown,
	path: string,
) => asserts value is number = (value, path) => {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
		throw new TypeError(`${path} must be a positive safe integer`)
	}
}

const assertAdapter: (
	value: unknown,
	path: string,
) => asserts value is string = (value, path) => {
	assertNonEmptyString(value, path)

	if (!adapterPattern.test(value)) {
		throw new TypeError(`${path} must be a lowercase adapter identifier`)
	}
}

/**
 * Creates protected neutral metadata for one adapter-specific compiler.
 *
 * Adapter packages should wrap this infrastructure factory with a concise
 * compiler API that retains their exact context and output types.
 *
 * @example
 * ```ts
 * const definition = defineDatabaseConstraintCompiler({
 *   adapter: 'postgres',
 *   kind: 'tenant.rows',
 *   version: 1,
 * })
 * ```
 */
export const defineDatabaseConstraintCompiler = <
	const TAdapter extends string,
	const TKind extends string,
	const TVersion extends number,
>(
	options: DefineDatabaseConstraintCompilerOptions<TAdapter, TKind, TVersion>,
): DatabaseConstraintCompilerDefinition<TAdapter, TKind, TVersion> => {
	const untrustedOptions: unknown = options

	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError(
			'database constraint compiler options must be a plain object',
		)
	}

	assertExactEnumerableKeys(
		untrustedOptions,
		definitionOptionKeys,
		'database constraint compiler contains unknown key: ',
	)

	assertAdapter(
		untrustedOptions.adapter,
		'database constraint compiler adapter',
	)
	assertDatabaseConstraintKind(
		untrustedOptions.kind,
		'database constraint compiler kind',
	)
	assertDatabaseConstraintVersion(
		untrustedOptions.version,
		'database constraint compiler version',
	)

	const definition = immutableRecord({
		adapter: options.adapter,
		kind: options.kind,
		version: options.version,
	}) as DatabaseConstraintCompilerDefinition<TAdapter, TKind, TVersion>
	definitions.add(definition)

	return definition
}

/** Rejects structural lookalikes that bypassed the protected metadata factory. */
export const isDatabaseConstraintCompilerDefinition = (
	value: unknown,
): value is DatabaseConstraintCompilerDefinition =>
	typeof value === 'object' && value !== null && definitions.has(value)

const readContributions = (
	values: readonly StoredConstraintCompilerContribution[],
): readonly DatabaseConstraintCompilerContribution[] =>
	immutableArray(
		values.map(({ ownerPlugin, value }) => {
			if (!isDatabaseConstraintCompilerDefinition(value)) {
				throw new TypeError(
					`Plugin "${ownerPlugin}" registered an invalid database constraint compiler`,
				)
			}

			return immutableRecord({ definition: value, ownerPlugin })
		}),
	)

/** Creates one stable read-only view over live compiler contributions. */
export const createDatabaseConstraintCompilerReader = (
	values: () => readonly StoredConstraintCompilerContribution[],
): DatabaseConstraintCompilerReader => {
	const readValues = (): readonly DatabaseConstraintCompilerContribution[] =>
		readContributions(values())

	return Object.freeze({
		get size(): number {
			return readValues().length
		},
		values: readValues,
	})
}

/** Builds the concise plugin facade over one application's shared contribution storage. */
export const createPluginConstraintCompilerRegistry = (
	options: CreatePluginConstraintCompilerRegistryOptions,
): PluginConstraintCompilerRegistry => {
	const readValues = (): readonly DatabaseConstraintCompilerContribution[] =>
		readContributions(options.values())

	return Object.freeze({
		get size(): number {
			return readValues().length
		},
		register: (definition: DatabaseConstraintCompilerDefinition): void => {
			if (!options.isOpen()) {
				throw new TypeError(
					'Database constraint compilers can only be registered during plugin setup',
				)
			}

			options.assertPrivilege()

			if (!isDatabaseConstraintCompilerDefinition(definition)) {
				throw new TypeError(
					'Database constraint compiler must be created by defineDatabaseConstraintCompiler',
				)
			}

			const { adapter, kind, version } = definition
			const existing = readValues().find(
				({ definition: candidate }) =>
					candidate.adapter === adapter &&
					candidate.kind === kind &&
					candidate.version === version,
			)
			if (existing !== undefined) {
				throw new FrameworkError(
					'PLUGIN_CONFLICT',
					`Database constraint compiler "${kind}" version ${String(version)} for adapter "${adapter}" is already owned by plugin "${existing.ownerPlugin}".`,
					{
						internalDetails: {
							adapter,
							constraintKind: kind,
							kind: 'duplicate-database-constraint-compiler',
							pluginNames: immutableArray([
								existing.ownerPlugin,
								options.ownerPlugin,
							]),
							version,
						},
					},
				)
			}

			// The semantic identity is private storage metadata, never caller provenance.
			options.register(`${adapter}:${kind}@${String(version)}`, definition)
		},
		values: readValues,
	})
}
