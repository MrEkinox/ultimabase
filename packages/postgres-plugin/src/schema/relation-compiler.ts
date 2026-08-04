import type {
	ResolvedSchemaRelation,
	SchemaDefinition,
	SchemaTargetGraph,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { getTableColumns } from 'drizzle-orm'
import {
	foreignKey,
	getTableConfig,
	index,
	pgTable,
	uniqueIndex,
	uuid,
	type PgColumn,
} from 'drizzle-orm/pg-core'

import { createPostgresForeignKeyName } from '../naming/foreign-key.js'
import { createPostgresIndexName } from '../naming/index.js'
import { createPostgresRelationTableName } from '../naming/relation.js'
import type {
	CompiledPostgresIndex,
	CompiledPostgresJoinRelation,
	CompiledPostgresRelation,
	CompiledPostgresRelationForeignKey,
	CompiledPostgresSchema,
} from './contracts.js'

const sourceColumnName = 'source_id'
const targetColumnName = 'target_id'

/** Resolves one schema from the already compiled application catalog. */
const requireCompiledSchema = (
	schemas: ReadonlyMap<SchemaDefinition, CompiledPostgresSchema>,
	schema: SchemaDefinition,
): CompiledPostgresSchema => {
	const compiled = schemas.get(schema)

	if (compiled === undefined) {
		throw new TypeError(
			`PostgreSQL relation schema is not registered: ${schema.className}`,
		)
	}

	return compiled
}

const requireIdColumn = (schema: CompiledPostgresSchema): PgColumn => {
	const id = getTableColumns(schema.table).id

	if (id === undefined) {
		throw new TypeError(
			`PostgreSQL relation schema has no id column: ${schema.tableName}`,
		)
	}

	return id
}

/** Creates one deterministic hidden join table for an owning relation. */
const compileOwningJoinRelation = (
	relation: ResolvedSchemaRelation,
	schemas: ReadonlyMap<SchemaDefinition, CompiledPostgresSchema>,
): CompiledPostgresJoinRelation => {
	const fieldName = relation.fieldPath[0]

	if (fieldName === undefined || relation.fieldPath.length !== 1) {
		throw new TypeError('PostgreSQL relation field path must contain one field')
	}

	const source = requireCompiledSchema(schemas, relation.source)
	const target = requireCompiledSchema(schemas, relation.target)
	const tableName = createPostgresRelationTableName(
		source.tableName,
		fieldName,
		target.tableName,
	)
	const uniqueName = createPostgresIndexName(
		tableName,
		[sourceColumnName, targetColumnName],
		true,
	)
	const sourceIndexName = createPostgresIndexName(
		tableName,
		[sourceColumnName],
		false,
	)
	const targetIndexName = createPostgresIndexName(
		tableName,
		[targetColumnName],
		false,
	)
	const sourceForeignKey: CompiledPostgresRelationForeignKey = immutableRecord({
		column: sourceColumnName,
		constraintName: createPostgresForeignKeyName(
			tableName,
			sourceColumnName,
			source.tableName,
			'id',
		),
		targetTable: source.tableName,
	})
	const targetForeignKey: CompiledPostgresRelationForeignKey = immutableRecord({
		column: targetColumnName,
		constraintName: createPostgresForeignKeyName(
			tableName,
			targetColumnName,
			target.tableName,
			'id',
		),
		targetTable: target.tableName,
	})
	const table = pgTable(
		tableName,
		{
			sourceId: uuid(sourceColumnName).notNull(),
			targetId: uuid(targetColumnName).notNull(),
		},
		(columns) => [
			uniqueIndex(uniqueName).on(columns.sourceId, columns.targetId),
			index(sourceIndexName).on(columns.sourceId),
			index(targetIndexName).on(columns.targetId),
			foreignKey({
				columns: [columns.sourceId],
				foreignColumns: [requireIdColumn(source)],
				name: sourceForeignKey.constraintName,
			}).onDelete('cascade'),
			foreignKey({
				columns: [columns.targetId],
				foreignColumns: [requireIdColumn(target)],
				name: targetForeignKey.constraintName,
			}).onDelete('cascade'),
		],
	)
	const columns = getTableColumns(table)
	const sourceColumn = columns.sourceId
	const targetColumn = columns.targetId

	const indexes = immutableArray(
		getTableConfig(table).indexes.map(
			(compiledIndex, position): CompiledPostgresIndex => {
				const fields =
					position === 0
						? ([sourceColumnName, targetColumnName] as const)
						: position === 1
							? ([sourceColumnName] as const)
							: ([targetColumnName] as const)
				const name = compiledIndex.config.name

				if (name === undefined) {
					throw new TypeError('Drizzle omitted PostgreSQL relation index name')
				}

				return immutableRecord({
					fields,
					index: compiledIndex,
					method: 'btree',
					name,
					unique: position === 0,
				})
			},
		),
	)

	return immutableRecord({
		foreignKeys: immutableArray([sourceForeignKey, targetForeignKey]),
		indexes,
		owner: relation,
		sourceColumn,
		table,
		tableName,
		targetColumn,
	})
}

const relationPathKey = (fieldPath: readonly string[]): string =>
	JSON.stringify(fieldPath)

/** Compiles owning storage first, then orients every declared inverse to it. */
export const compilePostgresRelations = (
	targets: SchemaTargetGraph,
	schemas: ReadonlyMap<SchemaDefinition, CompiledPostgresSchema>,
): Readonly<{
	readonly joins: readonly CompiledPostgresJoinRelation[]
	readonly relations: readonly CompiledPostgresRelation[]
}> => {
	const joinsBySource = new Map<
		SchemaDefinition,
		Map<string, CompiledPostgresJoinRelation>
	>()
	const joins: CompiledPostgresJoinRelation[] = []

	for (const relation of targets.relations()) {
		if (relation.ownership !== 'owning') continue

		const join = compileOwningJoinRelation(relation, schemas)
		const sourceJoins =
			joinsBySource.get(relation.source) ??
			new Map<string, CompiledPostgresJoinRelation>()

		sourceJoins.set(relationPathKey(relation.fieldPath), join)
		joinsBySource.set(relation.source, sourceJoins)
		joins.push(join)
	}

	const relations = targets
		.relations()
		.map((relation): CompiledPostgresRelation => {
			const source = requireCompiledSchema(schemas, relation.source)
			const target = requireCompiledSchema(schemas, relation.target)

			if (relation.ownership === 'owning') {
				const join = joinsBySource
					.get(relation.source)
					?.get(relationPathKey(relation.fieldPath))

				if (join === undefined) {
					throw new TypeError(
						'PostgreSQL owning relation storage is unavailable',
					)
				}

				return immutableRecord({
					relation,
					source,
					storage: immutableRecord({
						kind: 'join' as const,
						relation: join,
						sourceColumn: join.sourceColumn,
						targetColumn: join.targetColumn,
					}),
					target,
				})
			}

			const mapping = relation.mappedBy

			if (mapping === undefined) {
				throw new TypeError(
					'PostgreSQL inverse relation mapping is unavailable',
				)
			}

			if (mapping.kind === 'pointer') {
				const fieldName = mapping.fieldPath[0]
				const targetColumn =
					fieldName === undefined ? undefined : target.fields[fieldName]?.column

				if (targetColumn === undefined) {
					throw new TypeError(
						'PostgreSQL inverse pointer column is unavailable',
					)
				}

				return immutableRecord({
					relation,
					source,
					storage: immutableRecord({
						kind: 'pointer' as const,
						targetColumn,
					}),
					target,
				})
			}

			const join = joinsBySource
				.get(mapping.schema)
				?.get(relationPathKey(mapping.fieldPath))

			if (join === undefined) {
				throw new TypeError(
					'PostgreSQL inverse relation storage is unavailable',
				)
			}

			return immutableRecord({
				relation,
				source,
				storage: immutableRecord({
					kind: 'join' as const,
					relation: join,
					// Inverse traversal swaps the owning edge orientation.
					sourceColumn: join.targetColumn,
					targetColumn: join.sourceColumn,
				}),
				target,
			})
		})

	return immutableRecord({
		joins: immutableArray(joins),
		relations: immutableArray(relations),
	})
}
