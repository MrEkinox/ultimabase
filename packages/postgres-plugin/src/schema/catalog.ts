import type {
	DatabaseRelationScope,
	SchemaDefinition,
	SchemaTargetGraph,
} from '@ultimabase/core'
import { immutableArray } from '@ultimabase/shared'

import type {
	CompiledPostgresJoinRelation,
	CompiledPostgresRelation,
	CompiledPostgresSchema,
} from './contracts.js'
import { compilePostgresRelations } from './relation-compiler.js'
import { compilePostgresSchemas } from './schema-compiler.js'

/** Owns application-scoped compiled tables without exposing mutable map operations. */
export class PostgresSchemaCatalog {
	readonly #schemas = new Map<object, CompiledPostgresSchema>()
	readonly #relations = new Map<object, Map<string, CompiledPostgresRelation>>()
	readonly #joins: readonly CompiledPostgresJoinRelation[]

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

		this.#joins = relations.joins

		for (const relation of relations.relations) {
			const sourceRelations =
				this.#relations.get(relation.relation.source) ??
				new Map<string, CompiledPostgresRelation>()

			sourceRelations.set(JSON.stringify(relation.relation.fieldPath), relation)
			this.#relations.set(relation.relation.source, sourceRelations)
		}
	}

	/** Resolves the exact static schema identity retained by each Query AST. */
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
