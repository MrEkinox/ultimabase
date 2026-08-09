import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { getFieldSchemaTarget } from '../fields/base/definition.js'
import { collectFieldTraversalEntries } from '../fields/traversal.js'
import {
	compileSchemaRelations,
	readRelationMappedBy,
	type PendingSchemaRelation,
	type ResolvedSchemaRelation,
} from '../relations/mapping.js'
import {
	Schema,
	type SchemaDefinition,
	type SchemaFields,
} from './definition.js'
import type { SchemaRegistry } from './registry.js'

/** Lazily returns one exact schema class after module declarations are complete. */
export type SchemaTarget<TSchema extends SchemaDefinition = SchemaDefinition> =
	() => TSchema

/** Explains why one lazy target could not join an application's schema graph. */
export type SchemaTargetResolutionReason =
	'callback-threw' | 'foreign-target' | 'invalid-target' | 'unregistered-target'

/** Describes one immutable logical relationship edge without storage metadata. */
export interface ResolvedSchemaTarget {
	/** The exact schema that declares the relationship field. */
	readonly source: SchemaDefinition
	/** The structural field path inside the source schema. */
	readonly fieldPath: readonly string[]
	/** The exact application-owned schema returned by the lazy target. */
	readonly target: SchemaDefinition
}

/** Provides application-local read access to resolved relationship targets. */
export interface SchemaTargetGraph {
	/** Returns the number of resolved logical relationship edges. */
	readonly size: number
	/** Resolves one source field path by exact schema identity. */
	get(
		source: SchemaDefinition,
		fieldPath: readonly string[],
	): SchemaDefinition | undefined
	/** Returns an immutable declaration-ordered snapshot of every edge. */
	values(): readonly ResolvedSchemaTarget[]
	/** Resolves validated to-many metadata for one exact source field. */
	getRelation(
		source: SchemaDefinition,
		fieldPath: readonly string[],
	): ResolvedSchemaRelation | undefined
	/** Returns every validated relation in declaration order. */
	relations(): readonly ResolvedSchemaRelation[]
}

interface SchemaTargetResolutionErrorOptions extends ErrorOptions {
	readonly targetClassName?: string
}

/** Reports one target failure with its exact logical schema and field path. */
export class SchemaTargetResolutionError extends Error {
	readonly code = 'SCHEMA_TARGET_RESOLUTION_FAILED' as const
	readonly reason: SchemaTargetResolutionReason
	readonly sourceClassName: string
	readonly fieldPath: readonly string[]
	readonly targetClassName: string | undefined

	constructor(
		reason: SchemaTargetResolutionReason,
		sourceClassName: string,
		fieldPath: readonly string[],
		message: string,
		options: SchemaTargetResolutionErrorOptions = {},
	) {
		super(message, { cause: options.cause })

		this.name = 'SchemaTargetResolutionError'
		this.reason = reason
		this.sourceClassName = sourceClassName
		this.fieldPath = immutableArray(fieldPath)
		this.targetClassName = options.targetClassName

		// Resolution diagnostics must remain stable across setup cleanup boundaries.
		Object.freeze(this)
	}
}

const schemaTargetPathKey = (fieldPath: readonly string[]): string =>
	JSON.stringify(fieldPath)

const assertSchemaTargetPath: (
	fieldPath: unknown,
) => asserts fieldPath is readonly string[] = (fieldPath) => {
	if (
		!isUnknownArray(fieldPath) ||
		fieldPath.length === 0 ||
		fieldPath.some((segment) => typeof segment !== 'string' || segment === '')
	) {
		throw new TypeError('Schema target fieldPath must contain field names')
	}
}

/** Keeps mutable lookup maps private behind one frozen read-only graph facade. */
class ImmutableSchemaTargetGraph implements SchemaTargetGraph {
	readonly #targetsBySource = new Map<
		SchemaDefinition,
		Map<string, SchemaDefinition>
	>()
	readonly #values: readonly ResolvedSchemaTarget[]
	readonly #relationsBySource = new Map<
		SchemaDefinition,
		Map<string, ResolvedSchemaRelation>
	>()
	readonly #relations: readonly ResolvedSchemaRelation[]

	constructor(
		entries: readonly ResolvedSchemaTarget[],
		relations: readonly ResolvedSchemaRelation[],
	) {
		for (const entry of entries) {
			const targetsByPath =
				this.#targetsBySource.get(entry.source) ??
				new Map<string, SchemaDefinition>()
			const pathKey = schemaTargetPathKey(entry.fieldPath)

			targetsByPath.set(pathKey, entry.target)
			this.#targetsBySource.set(entry.source, targetsByPath)
		}

		for (const relation of relations) {
			const relationsByPath =
				this.#relationsBySource.get(relation.source) ??
				new Map<string, ResolvedSchemaRelation>()

			relationsByPath.set(schemaTargetPathKey(relation.fieldPath), relation)
			this.#relationsBySource.set(relation.source, relationsByPath)
		}

		this.#values = immutableArray(entries)
		this.#relations = immutableArray(relations)
		Object.freeze(this)
	}

	get(
		source: SchemaDefinition,
		fieldPath: readonly string[],
	): SchemaDefinition | undefined {
		if (!Schema.is(source)) {
			throw new TypeError(
				'Schema target source must be created by Schema.define',
			)
		}

		assertSchemaTargetPath(fieldPath)

		return this.#targetsBySource
			.get(source)
			?.get(schemaTargetPathKey(fieldPath))
	}

	get size(): number {
		return this.#values.length
	}

	values(): readonly ResolvedSchemaTarget[] {
		return this.#values
	}

	getRelation(
		source: SchemaDefinition,
		fieldPath: readonly string[],
	): ResolvedSchemaRelation | undefined {
		if (!Schema.is(source)) {
			throw new TypeError(
				'Schema relation source must be created by Schema.define',
			)
		}

		assertSchemaTargetPath(fieldPath)

		return this.#relationsBySource
			.get(source)
			?.get(schemaTargetPathKey(fieldPath))
	}

	relations(): readonly ResolvedSchemaRelation[] {
		return this.#relations
	}
}

const targetLocation = (
	source: SchemaDefinition,
	fieldPath: readonly string[],
): string => `${source.className}.${fieldPath.join('.')}`

const resolveTarget = (
	registry: SchemaRegistry,
	source: SchemaDefinition,
	fieldPath: readonly string[],
	target: unknown,
): SchemaDefinition => {
	const location = targetLocation(source, fieldPath)

	if (typeof target !== 'function') {
		throw new SchemaTargetResolutionError(
			'invalid-target',
			source.className,
			fieldPath,
			`Schema target at ${location} must be a function`,
		)
	}

	let resolvedTarget: unknown

	try {
		resolvedTarget = Reflect.apply(target, undefined, [])
	} catch (cause: unknown) {
		throw new SchemaTargetResolutionError(
			'callback-threw',
			source.className,
			fieldPath,
			`Schema target at ${location} threw during resolution`,
			{ cause },
		)
	}

	if (!Schema.is(resolvedTarget)) {
		throw new SchemaTargetResolutionError(
			'invalid-target',
			source.className,
			fieldPath,
			`Schema target at ${location} must return a class created by Schema.define`,
		)
	}

	const registeredTarget = registry.get(resolvedTarget.className)

	if (registeredTarget === undefined) {
		throw new SchemaTargetResolutionError(
			'unregistered-target',
			source.className,
			fieldPath,
			`Schema target at ${location} returned unregistered schema ${resolvedTarget.className}`,
			{ targetClassName: resolvedTarget.className },
		)
	}

	if (registeredTarget !== resolvedTarget) {
		throw new SchemaTargetResolutionError(
			'foreign-target',
			source.className,
			fieldPath,
			`Schema target at ${location} returned a foreign ${resolvedTarget.className} schema`,
			{ targetClassName: resolvedTarget.className },
		)
	}

	return registeredTarget
}

/** Compiles every field-owned lazy target after application schema setup closes. */
export const compileSchemaTargetGraph = (
	registry: SchemaRegistry,
	readFields: (schema: SchemaDefinition) => SchemaFields = (schema) =>
		schema.fields,
): SchemaTargetGraph => {
	const entries: ResolvedSchemaTarget[] = []
	const pendingRelations: PendingSchemaRelation[] = []

	for (const source of registry.values()) {
		for (const { field, path } of collectFieldTraversalEntries(
			readFields(source),
		)) {
			const target = getFieldSchemaTarget(field)

			if (target === undefined) {
				continue
			}

			const resolvedTarget = resolveTarget(registry, source, path, target)

			entries.push(
				immutableRecord({ fieldPath: path, source, target: resolvedTarget }),
			)

			if (field.kind === 'relation') {
				pendingRelations.push(
					immutableRecord({
						field,
						fieldPath: path,
						mappedBy: readRelationMappedBy(field),
						source,
						target: resolvedTarget,
					}),
				)
			}
		}
	}

	return new ImmutableSchemaTargetGraph(
		entries,
		compileSchemaRelations(pendingRelations, entries, readFields),
	)
}
