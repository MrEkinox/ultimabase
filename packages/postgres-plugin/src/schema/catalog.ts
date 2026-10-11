import type {
	DatabaseRelationScope,
	PrivateStorageAdapterCollection,
	SchemaDefinition,
	SchemaTargetGraph,
} from '@ultimabase/core'
import { immutableArray } from '@ultimabase/shared'
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core'

import {
	compilePostgresPrivateCollection,
	type CompiledPostgresPrivateCollection,
} from '../private-storage/compiler.js'
import type { PostgresConstraintDescription } from '../drizzle/operation-error.js'
import { required } from '../required.js'
import type {
	CompiledPostgresField,
	CompiledPostgresJoinRelation,
	CompiledPostgresPointerRelation,
	CompiledPostgresRelation,
	CompiledPostgresSchema,
} from './contracts.js'
import {
	compilePostgresDrizzleRelations,
	type CompiledPostgresDrizzleRelations,
	type PostgresDrizzlePointerBinding,
	type PostgresDrizzleRelationBinding,
} from './drizzle-relations.js'
import { compilePostgresRelations } from './relation-compiler.js'
import {
	readDrizzleIndexColumns,
	readDrizzleIndexName,
} from './index-compiler.js'
import { compilePostgresSchemas } from './schema-compiler.js'

const isSameFieldPath = (
	left: readonly string[],
	right: readonly string[],
): boolean => JSON.stringify(left) === JSON.stringify(right)

/** Owns application-scoped compiled tables without exposing mutable map operations. */
export class PostgresSchemaCatalog {
	readonly #schemas = new Map<object, CompiledPostgresSchema>()
	readonly #relations: readonly CompiledPostgresRelation[]
	readonly #drizzleRelations: CompiledPostgresDrizzleRelations
	readonly #joins: readonly CompiledPostgresJoinRelation[]
	readonly #pointers: readonly CompiledPostgresPointerRelation[]
	readonly #privateCollections = new Map<
		PrivateStorageAdapterCollection,
		CompiledPostgresPrivateCollection
	>()
	readonly #constraints = new Map<string, PostgresConstraintDescription>()
	#privateConfigured = false

	constructor(
		schemas: readonly SchemaDefinition[],
		targets?: SchemaTargetGraph,
	) {
		const compiled = compilePostgresSchemas(schemas, targets)

		for (const [position, schema] of schemas.entries()) {
			this.#schemas.set(
				schema,
				required(
					compiled[position],
					'PostgreSQL schema catalog compilation is incomplete',
				),
			)
		}

		const { joins, relations } =
			targets === undefined
				? { joins: [], relations: [] }
				: compilePostgresRelations(targets, (schema) =>
						this.#schemas.get(schema),
					)
		const pointers: CompiledPostgresPointerRelation[] = []

		for (const target of targets?.values() ?? []) {
			const source = this.get(target.source)
			const fieldName = target.fieldPath[0]
			const field =
				fieldName === undefined || target.fieldPath.length !== 1
					? undefined
					: source.fields[fieldName]

			if (field?.plan.field.kind === 'pointer') {
				pointers.push({
					fieldPath: target.fieldPath,
					source,
					target: this.get(target.target),
				})
			}
		}

		this.#joins = immutableArray(joins)
		this.#relations = relations
		this.#pointers = pointers
		this.#drizzleRelations = compilePostgresDrizzleRelations(
			compiled,
			joins,
			relations,
			pointers,
		)
		for (const schema of compiled) {
			this.#registerConstraints(schema, {
				schema: schema.definition.className,
			})
		}
	}

	/** Records unique indexes and foreign keys in logical names for error mapping. */
	#registerConstraints(
		compiled: Readonly<{
			fields: Readonly<Record<string, CompiledPostgresField>>
			table: PgTable
		}>,
		owner: Readonly<{ schema: string } | { collection: string }>,
	): void {
		const config = getTableConfig(compiled.table)
		// Constraints name physical columns; errors report logical field names.
		const fieldByColumn = new Map(
			Object.entries(compiled.fields).map(([fieldName, field]) => [
				field.column.name,
				fieldName,
			]),
		)
		const fieldOf = (column: string): string =>
			fieldByColumn.get(column) ?? column
		for (const index of config.indexes) {
			if (index.config.unique) {
				this.#constraints.set(readDrizzleIndexName(index), {
					kind: 'unique',
					...owner,
					fields: readDrizzleIndexColumns(index).map(fieldOf),
				})
			}
		}
		for (const foreignKey of config.foreignKeys) {
			const reference = foreignKey.reference()
			const targetTable = getTableConfig(reference.foreignTable).name
			const target = [...this.#schemas.values()].find(
				(schema) => schema.tableName === targetTable,
			)
			this.#constraints.set(foreignKey.getName(), {
				kind: 'reference',
				...owner,
				field: fieldOf(
					required(reference.columns[0], 'PostgreSQL foreign key has no column')
						.name,
				),
				target: target?.definition.className ?? targetTable,
			})
		}
	}

	/** Resolves one adapter-generated constraint name to logical schema fields. */
	describeConstraint(name: string): PostgresConstraintDescription | undefined {
		return this.#constraints.get(name)
	}

	/** Compiles owner-private tables once before PostgreSQL setup begins. */
	configurePrivateStorage(
		collections: readonly PrivateStorageAdapterCollection[],
	): void {
		if (this.#privateConfigured) {
			throw new TypeError('PostgreSQL private storage is already configured')
		}
		const tableNames = new Set(this.tableNames())
		for (const collection of collections) {
			const compiled = compilePostgresPrivateCollection(collection, this)
			if (tableNames.has(compiled.tableName)) {
				throw new TypeError(
					`Duplicate PostgreSQL private table: ${compiled.tableName}`,
				)
			}
			tableNames.add(compiled.tableName)
			this.#privateCollections.set(collection, compiled)
			this.#registerConstraints(compiled, {
				collection: collection.contributionId,
			})
		}
		this.#privateConfigured = true
	}

	/** Resolves one exact Core-attributed private collection identity. */
	getPrivateCollection(
		collection: PrivateStorageAdapterCollection,
	): CompiledPostgresPrivateCollection {
		return required(
			this.#privateCollections.get(collection),
			'PostgreSQL private collection is not registered',
		)
	}

	/** Lists private tables only for adapter-owned preparation. */
	privateValues(): readonly CompiledPostgresPrivateCollection[] {
		return immutableArray([...this.#privateCollections.values()])
	}

	/** Supplies generated RQB v2 metadata to every Drizzle client lifetime. */
	drizzleRelationDefinitions(): CompiledPostgresDrizzleRelations['relations'] {
		return this.#drizzleRelations.relations
	}

	/** Resolves the generated RQB table key for one compiled schema. */
	getDrizzleTableKey(schema: CompiledPostgresSchema): string {
		return required(
			this.#drizzleRelations.tableKeys.get(schema),
			'PostgreSQL Drizzle schema table is not registered',
		)
	}

	/** Resolves generated names for one exact logical relation orientation. */
	getDrizzleRelation(
		relation: CompiledPostgresRelation,
	): PostgresDrizzleRelationBinding {
		return required(
			this.#drizzleRelations.bindings.get(relation),
			'PostgreSQL Drizzle relation is not registered',
		)
	}

	/** Resolves generated RQB metadata for one exact direct pointer. */
	getDrizzlePointer(
		pointer: CompiledPostgresPointerRelation,
	): PostgresDrizzlePointerBinding {
		return required(
			this.#drizzleRelations.pointerBindings.get(pointer),
			'PostgreSQL Drizzle pointer is not registered',
		)
	}

	/** Resolves one direct pointer inclusion by exact schema identity and path. */
	getPointerDefinition(
		source: SchemaDefinition,
		fieldPath: readonly string[],
		target: SchemaDefinition,
	): CompiledPostgresPointerRelation {
		// The last registration wins, as for the keyed lookup it mirrors.
		const pointer = this.#pointers.findLast(
			(candidate) =>
				candidate.source.definition === source &&
				isSameFieldPath(candidate.fieldPath, fieldPath),
		)

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
			[
				...this.#schemas.values(),
				...this.#joins,
				...this.#privateCollections.values(),
			].map(({ tableName }) => tableName),
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
		const relation = this.#relations.findLast(
			(candidate) =>
				candidate.relation.source === source &&
				isSameFieldPath(candidate.relation.fieldPath, fieldPath),
		)

		if (relation?.relation.target !== target) {
			throw new TypeError('PostgreSQL relation scope is not registered')
		}

		return relation
	}
}
