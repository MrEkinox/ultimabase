import { immutableArray } from '@ultimabase/shared'

import { Schema, type SchemaDefinition } from './definition.js'
import { compileSchemaTargetGraph, type SchemaTargetGraph } from './targets.js'

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
			throw new TypeError(
				'Cannot register schemas after relationship targets are resolved',
			)
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

	/** Resolves every lazy relationship target and closes schema registration. */
	resolveSchemaTargets(): SchemaTargetGraph {
		this.#schemaTargets ??= compileSchemaTargetGraph(this)

		return this.#schemaTargets
	}

	/** Reads the immutable target graph after application declaration setup. */
	get schemaTargets(): SchemaTargetGraph {
		if (this.#schemaTargets === undefined) {
			throw new TypeError('Schema targets have not been resolved')
		}

		return this.#schemaTargets
	}
}
