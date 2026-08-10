import { immutableArray } from '@ultimabase/shared'

import {
	finalizeSchemaCompilation,
	prepareSchemaCompilation,
	Schema,
	validateSchemaCompilation,
	type PreparedSchemaCompilation,
	type SchemaCompiledTargetIdentity,
	type SchemaDefinition,
} from './definition.js'
import { compileSchemaTargetGraph, type SchemaTargetGraph } from './targets.js'
import type { FieldBuilderMethodResolver } from './field-builder-methods.js'

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

/**
 * Stores schemas per application while preserving deterministic insertion order.
 *
 * The registry is intentionally instance-owned mutable setup state, never a global.
 */
export class SchemaRegistry<
	const TSchemas extends readonly SchemaDefinition[] = readonly [],
> {
	readonly #schemasByClassName = new Map<string, SchemaDefinition>()
	#schemaTargets: SchemaTargetGraph | undefined

	constructor(schemas?: TSchemas) {
		for (const schema of schemas ?? []) {
			this.register(schema)
		}
	}

	/**
	 * Returns the number of registered class definitions.
	 */
	get size(): number {
		return this.#schemasByClassName.size
	}

	/**
	 * Registers one schema and rejects ambiguous class-name ownership.
	 */
	register(schema: SchemaDefinition): void {
		if (this.#schemaTargets !== undefined) {
			throw new TypeError('Cannot register schemas after static compilation')
		}

		if (!Schema.is(schema)) {
			throw new TypeError('schema must be a class created by Schema.define')
		}

		if (this.#schemasByClassName.has(schema.className)) {
			throw new DuplicateSchemaError(schema.className)
		}

		this.#schemasByClassName.set(schema.className, schema)
	}

	/**
	 * Checks a class name without changing registry state.
	 */
	has(className: string): boolean {
		return this.#schemasByClassName.has(className)
	}

	/**
	 * Retrieves a schema, preserving exact constructor-provided literals when known.
	 */
	get<const TClassName extends string>(
		className: TClassName,
	): SchemaForClassName<TSchemas, TClassName> | undefined

	get(className: string): SchemaDefinition | undefined {
		return this.#schemasByClassName.get(className)
	}

	/**
	 * Returns an immutable snapshot in registration order.
	 */
	values(): readonly SchemaDefinition[] {
		return immutableArray([...this.#schemasByClassName.values()])
	}

	/** Compiles every deferred declaration atomically before plugin setup starts. */
	compileSchemas(fieldMethods?: FieldBuilderMethodResolver): SchemaTargetGraph {
		if (this.#schemaTargets !== undefined) {
			return this.#schemaTargets
		}

		const prepared = this.values().map((schema) =>
			prepareSchemaCompilation(schema, fieldMethods, (className) =>
				this.get(className),
			),
		)
		const preparedBySchema = new Map<
			SchemaDefinition,
			PreparedSchemaCompilation
		>(prepared.map((candidate) => [candidate.schema, candidate]))
		const schemaTargets = compileSchemaTargetGraph(this, (schema) => {
			const candidate = preparedBySchema.get(schema)

			if (candidate === undefined) {
				throw new TypeError(
					`Schema compilation candidate is missing: ${schema.className}`,
				)
			}

			return candidate.definition.fields
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

		this.#schemaTargets = schemaTargets

		return schemaTargets
	}

	/** Resolves every lazy relationship target and closes schema registration. */
	resolveSchemaTargets(): SchemaTargetGraph {
		return this.compileSchemas()
	}

	/** Reads the immutable target graph after application static compilation. */
	get schemaTargets(): SchemaTargetGraph {
		if (this.#schemaTargets === undefined) {
			throw new TypeError('Schema targets have not been resolved')
		}

		return this.#schemaTargets
	}
}
