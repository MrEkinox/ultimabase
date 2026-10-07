import { immutableArray, isPlainRecord } from '@ultimabase/shared'

import {
	finalizeSchemaCompilation,
	prepareSchemaCompilation,
	validateSchemaCompilation,
} from './definition-compilation.js'
import {
	Schema,
	type PreparedSchemaCompilation,
	type SchemaCompiledTargetIdentity,
	type SchemaDefinition,
} from './definition.js'
import { compileSchemaTargetGraph, type SchemaTargetGraph } from './targets.js'
import type { FieldBuilderMethodResolver } from './field-builder-methods.js'
import { getDeclaredFieldOptionsContract } from '../fields/base/definition.js'
import type { GenericField } from '../fields/base/contract.js'
import { assertEmbeddedFieldDefinition } from '../fields/builtins/object.js'

const coreSchemaMetadataKeys = new Set([
	'className',
	'constraints',
	'fields',
	'indexes',
	'persistedFields',
	'provenance',
	'virtualFields',
])

/**
 * Re-checks embedded field provenance and, before plugins resolve options,
 * rejects option keys that no Core contract or installed plugin owns.
 */
const assertCompiledField = (
	field: GenericField,
	path: string,
	rejectUnresolvedOptions: boolean,
): void => {
	const contract = rejectUnresolvedOptions
		? getDeclaredFieldOptionsContract(field)
		: undefined
	const unknownKey = Object.keys(field.options).find(
		(key) => contract !== undefined && !contract.optionKeys.includes(key),
	)
	if (unknownKey !== undefined) {
		throw new TypeError(`Unknown ${field.kind} field option: ${unknownKey}`)
	}

	const nestedFields: unknown =
		field.kind === 'object' ? Reflect.get(field.options, 'fields') : undefined
	if (!isPlainRecord(nestedFields)) return

	for (const [name, nested] of Object.entries(nestedFields)) {
		const nestedPath = `${path}.fields.${name}`
		assertEmbeddedFieldDefinition(nested, nestedPath)
		if (rejectUnresolvedOptions) {
			assertCompiledField(nested, nestedPath, true)
		}
	}
}

const assertCompiledFields = (
	prepared: readonly PreparedSchemaCompilation[],
	rejectUnresolvedOptions: boolean,
): void => {
	for (const { definition, schema } of prepared) {
		const unknownSchemaKey = rejectUnresolvedOptions
			? Object.keys(definition).find((key) => !coreSchemaMetadataKeys.has(key))
			: undefined
		if (unknownSchemaKey !== undefined) {
			throw new TypeError(`Unknown schema option: ${unknownSchemaKey}`)
		}

		for (const [name, field] of Object.entries(definition.persistedFields)) {
			assertCompiledField(
				field,
				`${schema.className}.fields.${name}`,
				rejectUnresolvedOptions,
			)
		}
	}
}

type SchemaMatchingClassName<
	TSchemas extends readonly SchemaDefinition[],
	TClassName extends string,
> = Extract<TSchemas[number], { readonly className: TClassName }>

type SchemaForClassName<
	TSchemas extends readonly SchemaDefinition[],
	TClassName extends string,
> = string extends TClassName
	? SchemaDefinition
	: [SchemaMatchingClassName<TSchemas, TClassName>] extends [never]
		? SchemaDefinition
		: SchemaMatchingClassName<TSchemas, TClassName>

/**
 * Reports a class-name collision without coupling Schema to Core's error model.
 */
export class DuplicateSchemaError extends Error {
	readonly code = 'SCHEMA_DUPLICATE_CLASS_NAME' as const
	readonly className: string

	constructor(className: string) {
		super(`Duplicate schema class name: ${className}`)
		this.name = 'DuplicateSchemaError'
		this.className = className
	}
}

/** Exposes only compiled application schemas to plugin setup. */
export interface CompiledSchemaRegistry {
	readonly schemaTargets: SchemaTargetGraph
	readonly size: number
	get(className: string): SchemaDefinition | undefined
	has(className: string): boolean
	values(): readonly SchemaDefinition[]
}

interface SchemaRegistryState {
	readonly schemasByClassName: Map<string, SchemaDefinition>
	schemaTargets: SchemaTargetGraph | undefined
}

const schemaRegistryStates = new WeakMap<object, SchemaRegistryState>()

const getSchemaRegistryState = (registry: object): SchemaRegistryState => {
	const state = schemaRegistryStates.get(registry)
	if (state === undefined) {
		throw new TypeError('Schema registry state is unavailable')
	}

	return state
}

/**
 * Stores schemas per application while preserving deterministic insertion order.
 *
 * The registry is intentionally instance-owned mutable setup state, never a global.
 */
export class SchemaRegistry<
	const TSchemas extends readonly SchemaDefinition[] = readonly [],
> {
	constructor(schemas?: TSchemas) {
		schemaRegistryStates.set(this, {
			schemasByClassName: new Map<string, SchemaDefinition>(),
			schemaTargets: undefined,
		})
		for (const schema of schemas ?? []) {
			this.register(schema)
		}
	}

	/**
	 * Returns the number of registered class definitions.
	 */
	get size(): number {
		return getSchemaRegistryState(this).schemasByClassName.size
	}

	/**
	 * Registers one schema and rejects ambiguous class-name ownership.
	 */
	register(schema: SchemaDefinition): void {
		const state = getSchemaRegistryState(this)
		if (state.schemaTargets !== undefined) {
			throw new TypeError('Cannot register schemas after static compilation')
		}

		if (!Schema.is(schema)) {
			throw new TypeError('schema must be a class created by App.Schema.define')
		}

		if (state.schemasByClassName.has(schema.className)) {
			throw new DuplicateSchemaError(schema.className)
		}

		state.schemasByClassName.set(schema.className, schema)
	}

	/**
	 * Checks a class name without changing registry state.
	 */
	has(className: string): boolean {
		return getSchemaRegistryState(this).schemasByClassName.has(className)
	}

	/**
	 * Retrieves a schema, preserving exact constructor-provided literals when known.
	 */
	get<const TClassName extends string>(
		className: TClassName,
	): SchemaForClassName<TSchemas, TClassName> | undefined

	get(className: string): SchemaDefinition | undefined {
		return getSchemaRegistryState(this).schemasByClassName.get(className)
	}

	/**
	 * Returns an immutable snapshot in registration order.
	 */
	values(): readonly SchemaDefinition[] {
		return immutableArray([
			...getSchemaRegistryState(this).schemasByClassName.values(),
		])
	}

	/** Compiles every deferred declaration atomically before plugin setup starts. */
	compileSchemas(fieldMethods?: FieldBuilderMethodResolver): SchemaTargetGraph {
		const state = getSchemaRegistryState(this)
		if (state.schemaTargets !== undefined) {
			return state.schemaTargets
		}

		const prepared = prepareSchemaRegistry(this, fieldMethods)
		assertCompiledFields(prepared, true)
		state.schemaTargets = compilePreparedSchemaRegistry(
			this,
			prepared,
			prepared,
		)

		return state.schemaTargets
	}

	/** Resolves every lazy relationship target and closes schema registration. */
	resolveSchemaTargets(): SchemaTargetGraph {
		return this.compileSchemas()
	}

	/** Reads the immutable target graph after application static compilation. */
	get schemaTargets(): SchemaTargetGraph {
		const schemaTargets = getSchemaRegistryState(this).schemaTargets
		if (schemaTargets === undefined) {
			throw new TypeError('Schema targets have not been resolved')
		}

		return schemaTargets
	}
}

/** Resolves every registered declaration against one registry's own schemas. */
const prepareSchemaRegistry = (
	registry: SchemaRegistry,
	fieldMethods: FieldBuilderMethodResolver | undefined,
): readonly PreparedSchemaCompilation[] =>
	immutableArray(
		registry
			.values()
			.map((schema) =>
				prepareSchemaCompilation(schema, fieldMethods, (className) =>
					registry.get(className),
				),
			),
	)

const compilePreparedSchemaRegistry = (
	registry: SchemaRegistry,
	initialPrepared: readonly PreparedSchemaCompilation[],
	prepared: readonly PreparedSchemaCompilation[],
): SchemaTargetGraph => {
	if (
		prepared.length !== initialPrepared.length ||
		prepared.some(
			(candidate, index) => candidate.schema !== initialPrepared[index]?.schema,
		)
	) {
		throw new TypeError(
			'Schema compiler must preserve registry identities and order',
		)
	}
	const preparedBySchema = new Map<SchemaDefinition, PreparedSchemaCompilation>(
		prepared.map((candidate) => [candidate.schema, candidate]),
	)
	const schemaTargets = compileSchemaTargetGraph(registry, (schema) => {
		const candidate = preparedBySchema.get(schema)

		if (candidate === undefined) {
			throw new TypeError(
				`Schema compilation candidate is missing: ${schema.className}`,
			)
		}

		return candidate.definition.persistedFields
	})
	const targetsBySchema = new Map<
		SchemaDefinition,
		SchemaCompiledTargetIdentity[]
	>()

	for (const target of schemaTargets.values()) {
		const targets = targetsBySchema.get(target.source) ?? []

		targets.push({ fieldPath: target.fieldPath, target: target.target })
		targetsBySchema.set(target.source, targets)
	}

	for (const candidate of prepared) {
		validateSchemaCompilation(
			candidate,
			targetsBySchema.get(candidate.schema) ?? [],
		)
	}

	for (const candidate of prepared) {
		finalizeSchemaCompilation(
			candidate,
			targetsBySchema.get(candidate.schema) ?? [],
		)
	}

	return schemaTargets
}

/** Holds one isolated preparation until its complete decoded graph is validated. */
export interface StagedSchemaRegistryCompilation {
	readonly prepared: readonly PreparedSchemaCompilation[]
	readonly registry: SchemaRegistry
}

/** @internal Prepares additions in isolation without publishing partial metadata. */
export const stageSchemaRegistryCompilation = (
	registry: SchemaRegistry,
	additions: readonly SchemaDefinition[],
	fieldMethods: FieldBuilderMethodResolver,
): StagedSchemaRegistryCompilation => {
	if (getSchemaRegistryState(registry).schemaTargets !== undefined) {
		throw new TypeError('Cannot replace an already compiled schema registry')
	}
	const staged = new SchemaRegistry<readonly SchemaDefinition[]>([
		...registry.values(),
		...additions,
	])
	return {
		prepared: prepareSchemaRegistry(staged, fieldMethods),
		registry: staged,
	}
}

/** @internal Validates and atomically publishes one decoded compiler result. */
export const publishSchemaRegistryCompilation = (
	registry: SchemaRegistry,
	staging: StagedSchemaRegistryCompilation,
	prepared: readonly PreparedSchemaCompilation[],
): SchemaTargetGraph => {
	assertCompiledFields(prepared, false)
	const targets = compilePreparedSchemaRegistry(
		staging.registry,
		staging.prepared,
		immutableArray(prepared),
	)
	const stagedState = getSchemaRegistryState(staging.registry)
	stagedState.schemaTargets = targets
	schemaRegistryStates.set(registry, stagedState)

	return targets
}
