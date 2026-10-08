import {
	defineRelations,
	RelationsBuilderColumn,
	type ManyConfig,
	type ManyFn,
	type OneConfig,
	type OneFn,
	type Relation,
	type RelationsBuilder,
	type SchemaEntry,
	type TablesRelationalConfig,
} from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'

import { required } from '../required.js'
import type {
	CompiledPostgresJoinRelation,
	CompiledPostgresPointerRelation,
	CompiledPostgresRelation,
	CompiledPostgresSchema,
} from './contracts.js'

export interface PostgresDrizzleRelationBinding {
	readonly reverseRelationName: string
	readonly sourceRelationName: string
	readonly sourceTableKey: string
	readonly targetTableKey: string
}

export interface PostgresDrizzlePointerBinding {
	readonly relationName: string
	readonly sourceTableKey: string
	readonly targetTableKey: string
}

/** Retains generated Drizzle relation metadata behind exact compiled identities. */
export interface CompiledPostgresDrizzleRelations {
	readonly bindings: ReadonlyMap<
		CompiledPostgresRelation,
		PostgresDrizzleRelationBinding
	>
	readonly pointerBindings: ReadonlyMap<
		CompiledPostgresPointerRelation,
		PostgresDrizzlePointerBinding
	>
	readonly relations: TablesRelationalConfig
	readonly tableKeys: ReadonlyMap<CompiledPostgresSchema, string>
}

type DynamicPostgresHelpers = RelationsBuilder<
	Readonly<Record<string, PgTable>>
>

const readBuilderColumn = (
	helpers: DynamicPostgresHelpers,
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

/** Calls Drizzle's generated relation factory for one dynamic table key. */
const createRelation = (
	helpers: DynamicPostgresHelpers,
	cardinality: 'many' | 'one',
	targetTableKey: string,
	config: ManyConfig<SchemaEntry> & OneConfig<SchemaEntry, boolean>,
): Relation => {
	const factory = helpers[cardinality][targetTableKey]

	if (typeof factory !== 'function') {
		throw new TypeError(
			`Drizzle ${cardinality}-relation target is unavailable: ${targetTableKey}`,
		)
	}

	// Generated keys erase Drizzle's per-table factory typing.
	return cardinality === 'many'
		? (factory as ManyFn<PgTable, string>)(config)
		: (factory as OneFn<PgTable, string>)(config)
}

/** Builds the forward and generated reverse relation for one logical edge. */
const createRelationPair = (
	helpers: DynamicPostgresHelpers,
	relation: CompiledPostgresRelation,
	sourceTableKey: string,
	targetTableKey: string,
	joinTableKey: (join: CompiledPostgresJoinRelation) => string,
): Readonly<{ readonly forward: Relation; readonly reverse: Relation }> => {
	const storage = relation.storage
	const sourceId = readBuilderColumn(helpers, sourceTableKey, 'id')
	const targetId = readBuilderColumn(helpers, targetTableKey, 'id')

	if (storage.kind === 'pointer') {
		const pointerFieldName = required(
			Object.entries(relation.target.fields).find(
				([, field]) => field.column === storage.targetColumn,
			)?.[0],
			'Drizzle pointer relation field is unavailable',
		)
		const pointer = readBuilderColumn(helpers, targetTableKey, pointerFieldName)

		return {
			forward: createRelation(helpers, 'many', targetTableKey, {
				from: sourceId,
				to: pointer,
			}),
			reverse: createRelation(helpers, 'one', sourceTableKey, {
				from: pointer,
				to: sourceId,
			}),
		}
	}

	const joinKey = joinTableKey(storage.relation)
	const [sourceColumn, targetColumn] =
		storage.sourceColumn === storage.relation.sourceColumn
			? ['sourceId', 'targetId']
			: ['targetId', 'sourceId']
	const sourceEdge = readBuilderColumn(helpers, joinKey, sourceColumn)
	const targetEdge = readBuilderColumn(helpers, joinKey, targetColumn)

	return {
		forward: createRelation(helpers, 'many', targetTableKey, {
			from: sourceId.through(sourceEdge),
			to: targetId.through(targetEdge),
		}),
		reverse: createRelation(helpers, 'many', sourceTableKey, {
			from: targetId.through(targetEdge),
			to: sourceId.through(sourceEdge),
		}),
	}
}

/** Picks a generated relation key that no declared field on the table can shadow. */
const createReverseRelationName = (
	config: ReadonlyMap<string, Relation>,
	position: number,
): string => {
	let suffix = position

	while (config.has(`__ultimabase_reverse_${String(suffix)}`)) {
		suffix += 1
	}

	return `__ultimabase_reverse_${String(suffix)}`
}

/** Generates Drizzle RQB v2 metadata from the already resolved UltimaBase graph. */
export const compilePostgresDrizzleRelations = (
	schemas: readonly CompiledPostgresSchema[],
	joins: readonly CompiledPostgresJoinRelation[],
	relations: readonly CompiledPostgresRelation[],
	pointers: readonly CompiledPostgresPointerRelation[] = [],
): CompiledPostgresDrizzleRelations => {
	const schemaEntries = schemas.map(
		(schema, position) => [`schema_${String(position)}`, schema] as const,
	)
	const joinEntries = joins.map(
		(join, position) => [`join_${String(position)}`, join] as const,
	)
	const schemaTableKeys = new Map(
		schemaEntries.map(([key, schema]) => [schema, key]),
	)
	const joinTableKeys = new Map(joinEntries.map(([key, join]) => [join, key]))
	const tables = Object.fromEntries(
		[...schemaEntries, ...joinEntries].map(([key, { table }]) => [key, table]),
	)
	const tableKey = <TValue>(
		keys: ReadonlyMap<TValue, string>,
		value: TValue,
		kind: string,
	): string =>
		required(keys.get(value), `Drizzle ${kind} table key is unavailable`)
	const bindings = new Map<
		CompiledPostgresRelation,
		PostgresDrizzleRelationBinding
	>()
	const pointerBindings = new Map<
		CompiledPostgresPointerRelation,
		PostgresDrizzlePointerBinding
	>()
	const drizzleRelations = defineRelations(tables, (helpers) => {
		// Generated relation names live in maps so declared field names stay inert keys.
		const config = new Map(
			Object.keys(tables).map((key) => [key, new Map<string, Relation>()]),
		)
		const tableConfig = (key: string, kind: string): Map<string, Relation> =>
			required(config.get(key), `Drizzle ${kind} configuration is unavailable`)

		for (const [position, relation] of relations.entries()) {
			const sourceTableKey = tableKey(
				schemaTableKeys,
				relation.source,
				'source',
			)
			const targetTableKey = tableKey(
				schemaTableKeys,
				relation.target,
				'target',
			)
			const sourceConfig = tableConfig(sourceTableKey, 'relation')
			const targetConfig = tableConfig(targetTableKey, 'relation')
			const sourceRelationName = relation.relation.fieldPath[0]

			if (
				sourceRelationName === undefined ||
				relation.relation.fieldPath.length !== 1
			) {
				throw new TypeError('Drizzle relation path must contain one field')
			}
			if (sourceConfig.has(sourceRelationName)) {
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
				(join) => tableKey(joinTableKeys, join, 'join'),
			)

			sourceConfig.set(sourceRelationName, pair.forward)
			targetConfig.set(reverseRelationName, pair.reverse)
			bindings.set(relation, {
				reverseRelationName,
				sourceRelationName,
				sourceTableKey,
				targetTableKey,
			})
		}

		for (const [position, pointer] of pointers.entries()) {
			const fieldName = pointer.fieldPath[0]

			if (fieldName === undefined || pointer.fieldPath.length !== 1) {
				throw new TypeError('Drizzle pointer path must contain one field')
			}

			const sourceTableKey = tableKey(
				schemaTableKeys,
				pointer.source,
				'pointer source',
			)
			const targetTableKey = tableKey(
				schemaTableKeys,
				pointer.target,
				'pointer target',
			)
			const sourceConfig = tableConfig(sourceTableKey, 'pointer')
			const targetConfig = tableConfig(targetTableKey, 'pointer')
			const relationName = createReverseRelationName(
				sourceConfig,
				relations.length + pointers.length + position,
			)
			const sourcePointer = readBuilderColumn(
				helpers,
				sourceTableKey,
				fieldName,
			)
			const targetId = readBuilderColumn(helpers, targetTableKey, 'id')
			const reverseRelationName = createReverseRelationName(
				targetConfig,
				relations.length + position,
			)

			sourceConfig.set(
				relationName,
				createRelation(helpers, 'one', targetTableKey, {
					from: sourcePointer,
					to: targetId,
				}),
			)
			targetConfig.set(
				reverseRelationName,
				createRelation(helpers, 'many', sourceTableKey, {
					from: targetId,
					to: sourcePointer,
				}),
			)
			pointerBindings.set(pointer, {
				relationName,
				sourceTableKey,
				targetTableKey,
			})
		}

		return Object.fromEntries(
			[...config].map(([key, entries]) => [key, Object.fromEntries(entries)]),
		)
	})

	return {
		bindings,
		pointerBindings,
		relations: drizzleRelations,
		tableKeys: schemaTableKeys,
	}
}
