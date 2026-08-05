import {
	defineRelations,
	RelationsBuilderColumn,
	type ManyConfig,
	type ManyFn,
	type OneConfig,
	type OneFn,
	type Relation,
	type RelationsBuilder,
	type RelationsBuilderConfigValue,
	type SchemaEntry,
	type TablesRelationalConfig,
} from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'

import type {
	CompiledPostgresJoinRelation,
	CompiledPostgresRelation,
	CompiledPostgresSchema,
} from './contracts.js'

export interface PostgresDrizzleRelationBinding {
	readonly reverseRelationName: string
	readonly sourceRelationName: string
	readonly sourceTableKey: string
	readonly targetTableKey: string
}

/** Retains generated Drizzle relation metadata behind exact compiled identities. */
export interface CompiledPostgresDrizzleRelations {
	readonly bindings: ReadonlyMap<
		CompiledPostgresRelation,
		PostgresDrizzleRelationBinding
	>
	readonly relations: TablesRelationalConfig
}

type DynamicPostgresTables = Readonly<Record<string, PgTable>>

const readBuilderColumn = (
	helpers: RelationsBuilder<DynamicPostgresTables>,
	tableKey: string,
	columnName: string,
): RelationsBuilderColumn => {
	const column = helpers[tableKey]?.[columnName]

	if (!(column instanceof RelationsBuilderColumn)) {
		throw new TypeError(
			`Drizzle relation column is unavailable: ${tableKey}.${columnName}`,
		)
	}

	return column
}

const createManyRelation = (
	helpers: RelationsBuilder<DynamicPostgresTables>,
	targetTableKey: string,
	config: ManyConfig<SchemaEntry>,
): Relation => {
	const factory = helpers.many[targetTableKey]

	if (typeof factory !== 'function') {
		throw new TypeError(
			`Drizzle many-relation target is unavailable: ${targetTableKey}`,
		)
	}

	return (factory as ManyFn<PgTable, string>)(config)
}

const createOneRelation = (
	helpers: RelationsBuilder<DynamicPostgresTables>,
	targetTableKey: string,
	config: OneConfig<SchemaEntry, boolean>,
): Relation => {
	const factory = helpers.one[targetTableKey]

	if (typeof factory !== 'function') {
		throw new TypeError(
			`Drizzle one-relation target is unavailable: ${targetTableKey}`,
		)
	}

	return (factory as OneFn<PgTable, string>)(config)
}

const requireTableKey = <TValue>(
	keys: ReadonlyMap<TValue, string>,
	value: TValue,
	kind: string,
): string => {
	const key = keys.get(value)

	if (key === undefined) {
		throw new TypeError(`Drizzle ${kind} table key is unavailable`)
	}

	return key
}

const resolvePointerFieldName = (
	relation: CompiledPostgresRelation,
): string => {
	if (relation.storage.kind !== 'pointer') {
		throw new TypeError('Drizzle pointer relation storage is unavailable')
	}

	const fieldName = Object.entries(relation.target.fields).find(
		([, field]) => field.column === relation.storage.targetColumn,
	)?.[0]

	if (fieldName === undefined) {
		throw new TypeError('Drizzle pointer relation field is unavailable')
	}

	return fieldName
}

const resolveJoinColumnNames = (
	relation: CompiledPostgresRelation,
): Readonly<{
	readonly source: 'sourceId' | 'targetId'
	readonly target: 'sourceId' | 'targetId'
}> => {
	if (relation.storage.kind !== 'join') {
		throw new TypeError('Drizzle join relation storage is unavailable')
	}

	return relation.storage.sourceColumn ===
		relation.storage.relation.sourceColumn
		? { source: 'sourceId', target: 'targetId' }
		: { source: 'targetId', target: 'sourceId' }
}

const createRelationPair = (
	helpers: RelationsBuilder<DynamicPostgresTables>,
	relation: CompiledPostgresRelation,
	sourceTableKey: string,
	targetTableKey: string,
	joinTableKeys: ReadonlyMap<CompiledPostgresJoinRelation, string>,
): Readonly<{
	readonly forward: Relation
	readonly reverse: Relation
}> => {
	const sourceId = readBuilderColumn(helpers, sourceTableKey, 'id')
	const targetId = readBuilderColumn(helpers, targetTableKey, 'id')

	if (relation.storage.kind === 'pointer') {
		const pointerFieldName = resolvePointerFieldName(relation)
		const pointer = readBuilderColumn(helpers, targetTableKey, pointerFieldName)

		return {
			forward: createManyRelation(helpers, targetTableKey, {
				from: sourceId,
				to: pointer,
			}),
			reverse: createOneRelation(helpers, sourceTableKey, {
				from: pointer,
				to: sourceId,
			}),
		}
	}

	const joinTableKey = requireTableKey(
		joinTableKeys,
		relation.storage.relation,
		'join',
	)
	const columnNames = resolveJoinColumnNames(relation)
	const sourceEdge = readBuilderColumn(
		helpers,
		joinTableKey,
		columnNames.source,
	)
	const targetEdge = readBuilderColumn(
		helpers,
		joinTableKey,
		columnNames.target,
	)

	return {
		forward: createManyRelation(helpers, targetTableKey, {
			from: sourceId.through(sourceEdge),
			to: targetId.through(targetEdge),
		}),
		reverse: createManyRelation(helpers, sourceTableKey, {
			from: targetId.through(targetEdge),
			to: sourceId.through(sourceEdge),
		}),
	}
}

const createReverseRelationName = (
	config: Readonly<Record<string, unknown>>,
	position: number,
): string => {
	let suffix = position
	let candidate = `__ultimabase_reverse_${String(suffix)}`

	while (Object.hasOwn(config, candidate)) {
		suffix += 1
		candidate = `__ultimabase_reverse_${String(suffix)}`
	}

	return candidate
}

/** Generates Drizzle RQB v2 metadata from the already resolved UltimaBase graph. */
export const compilePostgresDrizzleRelations = (
	schemas: readonly CompiledPostgresSchema[],
	joins: readonly CompiledPostgresJoinRelation[],
	relations: readonly CompiledPostgresRelation[],
): CompiledPostgresDrizzleRelations => {
	const tables: Record<string, PgTable> = {}
	const schemaTableKeys = new Map<CompiledPostgresSchema, string>()
	const joinTableKeys = new Map<CompiledPostgresJoinRelation, string>()

	for (const [position, schema] of schemas.entries()) {
		const key = `schema_${String(position)}`

		tables[key] = schema.table
		schemaTableKeys.set(schema, key)
	}

	for (const [position, join] of joins.entries()) {
		const key = `join_${String(position)}`

		tables[key] = join.table
		joinTableKeys.set(join, key)
	}

	const bindings = new Map<
		CompiledPostgresRelation,
		PostgresDrizzleRelationBinding
	>()
	const drizzleRelations = defineRelations(tables, (helpers) => {
		const config: Record<string, RelationsBuilderConfigValue> = {}

		for (const key of Object.keys(tables)) config[key] = {}

		for (const [position, relation] of relations.entries()) {
			const sourceTableKey = requireTableKey(
				schemaTableKeys,
				relation.source,
				'source',
			)
			const targetTableKey = requireTableKey(
				schemaTableKeys,
				relation.target,
				'target',
			)
			const sourceConfig = config[sourceTableKey]
			const targetConfig = config[targetTableKey]

			if (sourceConfig === undefined || targetConfig === undefined) {
				throw new TypeError('Drizzle relation configuration is unavailable')
			}

			const sourceRelationName = relation.relation.fieldPath[0]

			if (
				sourceRelationName === undefined ||
				relation.relation.fieldPath.length !== 1
			) {
				throw new TypeError('Drizzle relation path must contain one field')
			}
			if (Object.hasOwn(sourceConfig, sourceRelationName)) {
				throw new TypeError(
					`Duplicate Drizzle relation field: ${sourceRelationName}`,
				)
			}

			const reverseRelationName = createReverseRelationName(
				targetConfig,
				position,
			)
			const pair = createRelationPair(
				helpers,
				relation,
				sourceTableKey,
				targetTableKey,
				joinTableKeys,
			)

			sourceConfig[sourceRelationName] = pair.forward
			targetConfig[reverseRelationName] = pair.reverse
			bindings.set(relation, {
				reverseRelationName,
				sourceRelationName,
				sourceTableKey,
				targetTableKey,
			})
		}

		return config
	})

	return { bindings, relations: drizzleRelations }
}
