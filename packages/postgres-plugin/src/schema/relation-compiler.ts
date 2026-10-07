import type {
	ResolvedSchemaRelation,
	SchemaDefinition,
	SchemaTargetGraph,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { getColumns } from 'drizzle-orm'
import {
	foreignKey,
	index,
	pgTable,
	uniqueIndex,
	uuid,
	type PgColumn,
} from 'drizzle-orm/pg-core'

import {
	createPostgresForeignKeyName,
	createPostgresIndexName,
	createPostgresRelationTableName,
} from '../naming.js'
import { required } from '../required.js'
import type {
	CompiledPostgresJoinRelation,
	CompiledPostgresRelation,
	CompiledPostgresSchema,
} from './contracts.js'

type CompiledSchemaLookup = (
	schema: SchemaDefinition,
) => CompiledPostgresSchema | undefined

const sourceColumnName = 'source_id'
const targetColumnName = 'target_id'

const requireIdColumn = (schema: CompiledPostgresSchema): PgColumn =>
	required(
		getColumns(schema.table).id,
		`PostgreSQL relation schema has no id column: ${schema.tableName}`,
	)

/** Creates one deterministic hidden join table for an owning relation. */
const compileOwningJoinRelation = (
	relation: ResolvedSchemaRelation,
	compiled: (schema: SchemaDefinition) => CompiledPostgresSchema,
): CompiledPostgresJoinRelation => {
	const fieldName = relation.fieldPath[0]

	if (fieldName === undefined || relation.fieldPath.length !== 1) {
		throw new TypeError('PostgreSQL relation field path must contain one field')
	}

	const source = compiled(relation.source)
	const target = compiled(relation.target)

	const tableName = createPostgresRelationTableName(
		source.tableName,
		fieldName,
		target.tableName,
	)
	const edgeForeignKey = (
		column: PgColumn,
		columnName: string,
		schema: CompiledPostgresSchema,
	) =>
		foreignKey({
			columns: [column],
			foreignColumns: [requireIdColumn(schema)],
			name: createPostgresForeignKeyName(
				tableName,
				columnName,
				schema.tableName,
				'id',
			),
		}).onDelete('cascade')
	const table = pgTable(
		tableName,
		{
			sourceId: uuid(sourceColumnName).notNull(),
			targetId: uuid(targetColumnName).notNull(),
		},
		(columns) => [
			uniqueIndex(
				createPostgresIndexName(
					tableName,
					[sourceColumnName, targetColumnName],
					true,
				),
			).on(columns.sourceId, columns.targetId),
			index(createPostgresIndexName(tableName, [sourceColumnName], false)).on(
				columns.sourceId,
			),
			index(createPostgresIndexName(tableName, [targetColumnName], false)).on(
				columns.targetId,
			),
			edgeForeignKey(columns.sourceId, sourceColumnName, source),
			edgeForeignKey(columns.targetId, targetColumnName, target),
		],
	)
	const columns = getColumns(table)

	return immutableRecord({
		owner: relation,
		sourceColumn: columns.sourceId,
		table,
		tableName,
		targetColumn: columns.targetId,
	})
}

/** Compiles owning storage first, then orients every declared inverse to it. */
export const compilePostgresRelations = (
	targets: SchemaTargetGraph,
	lookup: CompiledSchemaLookup,
): Readonly<{
	readonly joins: readonly CompiledPostgresJoinRelation[]
	readonly relations: readonly CompiledPostgresRelation[]
}> => {
	const compiled = (schema: SchemaDefinition): CompiledPostgresSchema =>
		required(
			lookup(schema),
			`PostgreSQL relation schema is not registered: ${schema.className}`,
		)
	const joins = targets
		.relations()
		.filter((relation) => relation.ownership === 'owning')
		.map((relation) => compileOwningJoinRelation(relation, compiled))
	const findJoin = (
		schema: SchemaDefinition,
		fieldPath: readonly string[],
		message: string,
	): CompiledPostgresJoinRelation =>
		required(
			joins.find(
				({ owner }) =>
					owner.source === schema &&
					JSON.stringify(owner.fieldPath) === JSON.stringify(fieldPath),
			),
			message,
		)
	const relations = targets
		.relations()
		.map((relation): CompiledPostgresRelation => {
			const source = compiled(relation.source)
			const target = compiled(relation.target)
			const oriented = (
				storage: CompiledPostgresRelation['storage'],
			): CompiledPostgresRelation =>
				immutableRecord({
					relation,
					source,
					storage: immutableRecord(storage),
					target,
				})

			if (relation.ownership === 'owning') {
				const join = findJoin(
					relation.source,
					relation.fieldPath,
					'PostgreSQL owning relation storage is unavailable',
				)

				return oriented({
					kind: 'join',
					relation: join,
					sourceColumn: join.sourceColumn,
					targetColumn: join.targetColumn,
				})
			}

			const mapping = required(
				relation.mappedBy,
				'PostgreSQL inverse relation mapping is unavailable',
			)

			if (mapping.kind === 'pointer') {
				const fieldName = mapping.fieldPath[0]

				return oriented({
					kind: 'pointer',
					targetColumn: required(
						fieldName === undefined
							? undefined
							: target.fields[fieldName]?.column,
						'PostgreSQL inverse pointer column is unavailable',
					),
				})
			}

			const join = findJoin(
				mapping.schema,
				mapping.fieldPath,
				'PostgreSQL inverse relation storage is unavailable',
			)

			// Inverse traversal swaps the owning edge orientation.
			return oriented({
				kind: 'join',
				relation: join,
				sourceColumn: join.targetColumn,
				targetColumn: join.sourceColumn,
			})
		})

	return immutableRecord({
		joins: immutableArray(joins),
		relations: immutableArray(relations),
	})
}
