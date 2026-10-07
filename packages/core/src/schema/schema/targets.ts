import {
	assertNonEmptyString,
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

const namedSchemaTargets = new WeakMap<object, string>()

/** Creates one private exact target callback from an application schema name. */
export const createNamedSchemaTarget = (
	className: string,
	target: SchemaDefinition | undefined,
): SchemaTarget => {
	assertNonEmptyString(className, 'Schema target name')

	const namedTarget = (): SchemaDefinition => {
		if (target === undefined) {
			throw new TypeError(`Schema target is not registered: ${className}`)
		}

		return target
	}

	namedSchemaTargets.set(namedTarget, className)

	return namedTarget
}

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

interface SchemaFieldEdge {
	readonly source: SchemaDefinition
	readonly fieldPath: readonly string[]
}

/** Indexes edges by exact source identity, then by structural field path. */
const indexEdges = <TEdge extends SchemaFieldEdge>(
	edges: readonly TEdge[],
): ReadonlyMap<SchemaDefinition, ReadonlyMap<string, TEdge>> => {
	const index = new Map<SchemaDefinition, Map<string, TEdge>>()

	for (const edge of edges) {
		const byPath = index.get(edge.source) ?? new Map<string, TEdge>()

		byPath.set(schemaTargetPathKey(edge.fieldPath), edge)
		index.set(edge.source, byPath)
	}

	return index
}

/** Validates one untrusted lookup before it reaches the private indexes. */
const findEdge = <TEdge extends SchemaFieldEdge>(
	index: ReadonlyMap<SchemaDefinition, ReadonlyMap<string, TEdge>>,
	source: SchemaDefinition,
	fieldPath: readonly string[],
	label: 'relation' | 'target',
): TEdge | undefined => {
	if (!Schema.is(source)) {
		throw new TypeError(
			`Schema ${label} source must be created by App.Schema.define`,
		)
	}

	if (
		!isUnknownArray(fieldPath) ||
		fieldPath.length === 0 ||
		fieldPath.some((segment) => typeof segment !== 'string' || segment === '')
	) {
		throw new TypeError('Schema target fieldPath must contain field names')
	}

	return index.get(source)?.get(schemaTargetPathKey(fieldPath))
}

/** Keeps mutable lookup maps private behind one frozen read-only graph facade. */
class ImmutableSchemaTargetGraph implements SchemaTargetGraph {
	readonly #targets: ReadonlyMap<
		SchemaDefinition,
		ReadonlyMap<string, ResolvedSchemaTarget>
	>
	readonly #values: readonly ResolvedSchemaTarget[]
	readonly #relationIndex: ReadonlyMap<
		SchemaDefinition,
		ReadonlyMap<string, ResolvedSchemaRelation>
	>
	readonly #relations: readonly ResolvedSchemaRelation[]

	constructor(
		entries: readonly ResolvedSchemaTarget[],
		relations: readonly ResolvedSchemaRelation[],
	) {
		this.#targets = indexEdges(entries)
		this.#relationIndex = indexEdges(relations)
		this.#values = immutableArray(entries)
		this.#relations = immutableArray(relations)
		Object.freeze(this)
	}

	get(
		source: SchemaDefinition,
		fieldPath: readonly string[],
	): SchemaDefinition | undefined {
		return findEdge(this.#targets, source, fieldPath, 'target')?.target
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
		return findEdge(this.#relationIndex, source, fieldPath, 'relation')
	}

	relations(): readonly ResolvedSchemaRelation[] {
		return this.#relations
	}
}

const resolveTarget = (
	registry: SchemaRegistry,
	source: SchemaDefinition,
	fieldPath: readonly string[],
	target: unknown,
): SchemaDefinition => {
	const location = `${source.className}.${fieldPath.join('.')}`
	const fail = (
		reason: SchemaTargetResolutionReason,
		message: string,
		options?: SchemaTargetResolutionErrorOptions,
	): SchemaTargetResolutionError =>
		new SchemaTargetResolutionError(
			reason,
			source.className,
			fieldPath,
			`Schema target at ${location} ${message}`,
			options,
		)

	if (typeof target !== 'function') {
		throw fail('invalid-target', 'must be a function')
	}

	const namedTarget = namedSchemaTargets.get(target)

	if (namedTarget !== undefined) {
		const registeredTarget = registry.get(namedTarget)

		if (registeredTarget === undefined) {
			throw fail(
				'unregistered-target',
				`names unregistered schema ${namedTarget}`,
				{ targetClassName: namedTarget },
			)
		}

		return registeredTarget
	}

	let resolvedTarget: unknown

	try {
		resolvedTarget = Reflect.apply(target, undefined, [])
	} catch (cause: unknown) {
		throw fail('callback-threw', 'threw during resolution', { cause })
	}

	if (!Schema.is(resolvedTarget)) {
		throw fail(
			'invalid-target',
			'must return a class created by App.Schema.define',
		)
	}

	const { className } = resolvedTarget
	const registeredTarget = registry.get(className)

	if (registeredTarget === undefined) {
		throw fail(
			'unregistered-target',
			`returned unregistered schema ${className}`,
			{
				targetClassName: className,
			},
		)
	}

	if (registeredTarget !== resolvedTarget) {
		throw fail('foreign-target', `returned a foreign ${className} schema`, {
			targetClassName: className,
		})
	}

	return registeredTarget
}

/** Compiles every field-owned lazy target after application schema setup closes. */
export const compileSchemaTargetGraph = (
	registry: SchemaRegistry,
	readFields: (schema: SchemaDefinition) => SchemaFields = (schema) =>
		schema.persistedFields,
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
