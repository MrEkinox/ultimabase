import type {
	DatabaseRelationScope,
	SchemaDefinition,
	SchemaTargetGraph,
} from '@ultimabase/core'
import { immutableArray } from '@ultimabase/shared'

import type {
	CompiledPostgresJoinRelation,
	CompiledPostgresPointerRelation,
	CompiledPostgresRelation,
	CompiledPostgresSchema,
} from './contracts.js'
import {
	compilePostgresDrizzleRelations,
	type CompiledPostgresDrizzleRelations,
	type PostgresDrizzleRelationBinding,
	type PostgresDrizzlePointerBinding,
} from './drizzle-relations.js'
import { compilePostgresRelations } from './relation-compiler.js'
import { compilePostgresSchemas } from './schema-compiler.js'

/** Owns application-scoped compiled tables without exposing mutable map operations. */
export class PostgresSchemaCatalog {
	readonly #schemas = new Map<object, CompiledPostgresSchema>()
	readonly #relations = new Map<object, Map<string, CompiledPostgresRelation>>()
	readonly #drizzleRelations: CompiledPostgresDrizzleRelations
	readonly #joins: readonly CompiledPostgresJoinRelation[]
	readonly #pointers = new Map<
		object,
		Map<string, CompiledPostgresPointerRelation>
	>()

	constructor(
		schemas: readonly SchemaDefinition[],
		targets?: SchemaTargetGraph,
	) {
		const compiled = compilePostgresSchemas(schemas, targets)

		for (const [position, schema] of schemas.entries()) {
			const compiledSchema = compiled[position]

			if (compiledSchema === undefined) {
				throw new TypeError(
					'PostgreSQL schema catalog compilation is incomplete',
				)
			}

			this.#schemas.set(schema, compiledSchema)
		}

		if (targets === undefined) {
			this.#joins = immutableArray([])
			this.#drizzleRelations = compilePostgresDrizzleRelations(
				compiled,
				this.#joins,
				[],
				[],
			)
			return
		}

		const schemasByDefinition = new Map<
			SchemaDefinition,
			CompiledPostgresSchema
		>()

		for (const schema of schemas) {
			schemasByDefinition.set(schema, this.get(schema))
		}

		const relations = compilePostgresRelations(targets, schemasByDefinition)
		const pointers: CompiledPostgresPointerRelation[] = []

		for (const target of targets.values()) {
			const source = this.get(target.source)
			const fieldName = target.fieldPath[0]
			const field =
				fieldName === undefined || target.fieldPath.length !== 1
					? undefined
					: source.fields[fieldName]

			if (field?.plan.field.kind !== 'pointer') continue

			const pointer = {
				fieldPath: target.fieldPath,
				source,
				target: this.get(target.target),
			} satisfies CompiledPostgresPointerRelation
			const sourcePointers =
				this.#pointers.get(target.source) ??
				new Map<string, CompiledPostgresPointerRelation>()

			sourcePointers.set(JSON.stringify(target.fieldPath), pointer)
			this.#pointers.set(target.source, sourcePointers)
			pointers.push(pointer)
		}

		this.#joins = relations.joins
		this.#drizzleRelations = compilePostgresDrizzleRelations(
			compiled,
			relations.joins,
			relations.relations,
			pointers,
		)

		for (const relation of relations.relations) {
			const sourceRelations =
				this.#relations.get(relation.relation.source) ??
				new Map<string, CompiledPostgresRelation>()

			sourceRelations.set(JSON.stringify(relation.relation.fieldPath), relation)
			this.#relations.set(relation.relation.source, sourceRelations)
		}
	}

	/** Supplies generated RQB v2 metadata to every Drizzle client lifetime. */
	drizzleRelationDefinitions(): CompiledPostgresDrizzleRelations['relations'] {
		return this.#drizzleRelations.relations
	}

	/** Resolves the generated RQB table key for one compiled schema. */
	getDrizzleTableKey(schema: CompiledPostgresSchema): string {
		const key = this.#drizzleRelations.tableKeys.get(schema)

		if (key === undefined) {
			throw new TypeError('PostgreSQL Drizzle schema table is not registered')
		}

		return key
	}

	/** Resolves generated names for one exact logical relation orientation. */
	getDrizzleRelation(
		relation: CompiledPostgresRelation,
	): PostgresDrizzleRelationBinding {
		const binding = this.#drizzleRelations.bindings.get(relation)

		if (binding === undefined) {
			throw new TypeError('PostgreSQL Drizzle relation is not registered')
		}

		return binding
	}

	/** Resolves generated RQB metadata for one exact direct pointer. */
	getDrizzlePointer(
		pointer: CompiledPostgresPointerRelation,
	): PostgresDrizzlePointerBinding {
		const binding = this.#drizzleRelations.pointerBindings.get(pointer)

		if (binding === undefined) {
			throw new TypeError('PostgreSQL Drizzle pointer is not registered')
		}

		return binding
	}

	/** Resolves one direct pointer inclusion by exact schema identity and path. */
	getPointerDefinition(
		source: SchemaDefinition,
		fieldPath: readonly string[],
		target: SchemaDefinition,
	): CompiledPostgresPointerRelation {
		const pointer = this.#pointers.get(source)?.get(JSON.stringify(fieldPath))

		if (pointer?.target.definition !== target) {
			throw new TypeError('PostgreSQL pointer inclusion is not registered')
		}

		return pointer
	}

	/** Resolves the exact static schema identity retained by each QueryBuilder AST. */
	get(schema: unknown): CompiledPostgresSchema {
		if (
			(typeof schema !== 'object' || schema === null) &&
			typeof schema !== 'function'
		) {
			throw new TypeError('PostgreSQL operation does not reference a schema')
		}

		const compiled = this.#schemas.get(schema)

		if (compiled === undefined) {
			const className =
				'className' in schema && typeof schema.className === 'string'
					? schema.className
					: 'unknown'

			throw new TypeError(`PostgreSQL schema is not registered: ${className}`)
		}

		return compiled
	}

	/** Lists exact managed table identifiers for catalog ownership classification. */
	tableNames(): readonly string[] {
		return immutableArray(
			[...this.#schemas.values(), ...this.#joins].map(
				({ tableName }) => tableName,
			),
		)
	}

	/** Returns compiled schemas in declaration order for deterministic preparation. */
	values(): readonly CompiledPostgresSchema[] {
		return immutableArray([...this.#schemas.values()])
	}

	/** Lists each physical owning join once for schema preparation. */
	relationValues(): readonly CompiledPostgresJoinRelation[] {
		return this.#joins
	}

	/** Resolves one Runtime-validated edge by exact application schema identity. */
	getRelation(scope: DatabaseRelationScope): CompiledPostgresRelation {
		return this.getRelationDefinition(
			scope.source,
			scope.fieldPath,
			scope.target,
		)
	}

	/** Resolves relation metadata without manufacturing an object-scoped edge. */
	getRelationDefinition(
		source: SchemaDefinition,
		fieldPath: readonly string[],
		target: SchemaDefinition,
	): CompiledPostgresRelation {
		const relation = this.#relations.get(source)?.get(JSON.stringify(fieldPath))

		if (relation?.relation.target !== target) {
			throw new TypeError('PostgreSQL relation scope is not registered')
		}

		return relation
	}
}
