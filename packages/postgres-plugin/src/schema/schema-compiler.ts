import {
	compileValidationPlans,
	type FieldValidationPlan,
	type PointerReferentialAction,
	type SchemaDefinition,
	type SchemaTargetGraph,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { getColumns } from 'drizzle-orm'
import {
	foreignKey,
	getTableConfig,
	pgTable,
	type AnyPgColumnBuilder,
	type PgColumn,
	type PgTable,
	type UpdateDeleteAction,
} from 'drizzle-orm/pg-core'

import {
	assertDistinctPostgresColumns,
	createPostgresForeignKeyName,
	toPostgresColumnName,
} from '../naming.js'
import {
	resolvePostgresRenamedFrom,
	resolvePostgresTableName,
} from '../options.js'
import { required } from '../required.js'
import type {
	CompiledPostgresField,
	CompiledPostgresSchema,
	PostgresStorageKind,
} from './contracts.js'
import { compilePostgresFieldBuilder } from './field-compiler.js'
import { compilePostgresIndexBuilders } from './index-compiler.js'

const assertNoNestedRenames = (
	plan: FieldValidationPlan,
	path: string,
): void => {
	if (plan.kind === 'array') {
		assertNoNestedRenames(plan.items, path)
		return
	}

	if (plan.kind !== 'object') {
		return
	}

	for (const [name, child] of Object.entries(plan.fields)) {
		const childPath = `${path}.${name}`

		if (resolvePostgresRenamedFrom(child.field) !== undefined) {
			throw new TypeError(
				`PostgreSQL renamedFrom requires a top-level column: ${childPath}`,
			)
		}

		assertNoNestedRenames(child, childPath)
	}
}

interface PreparedPostgresSchema {
	readonly pendingFields: readonly [
		string,
		Omit<CompiledPostgresField, 'column'>,
	][]
	readonly schema: SchemaDefinition
	readonly table: PgTable
	readonly tableName: string
}

interface PreparedPostgresPointer {
	readonly constraintName: string
	readonly fieldName: string
	readonly onDelete: UpdateDeleteAction
	readonly targetSchema: SchemaDefinition
}

const postgresReferentialActions: ReadonlyMap<unknown, UpdateDeleteAction> =
	new Map<PointerReferentialAction, UpdateDeleteAction>([
		['cascade', 'cascade'],
		['restrict', 'restrict'],
		['setNull', 'set null'],
	])

const resolvePointerMetadata = (
	schema: SchemaDefinition,
	fieldName: string,
	plan: FieldValidationPlan,
	targets: SchemaTargetGraph | undefined,
): PreparedPostgresPointer | undefined => {
	if (plan.kind !== 'scalar' || plan.field.kind !== 'pointer') return undefined

	const targetSchema = required(
		targets?.get(schema, [fieldName]),
		`PostgreSQL pointer target is unavailable: ${schema.className}.${fieldName}`,
	)
	const targetTable = resolvePostgresTableName(targetSchema)
	const onDelete = required(
		postgresReferentialActions.get(Reflect.get(plan.field.options, 'onDelete')),
		`PostgreSQL pointer has invalid onDelete metadata: ${fieldName}`,
	)

	return immutableRecord({
		constraintName: createPostgresForeignKeyName(
			resolvePostgresTableName(schema),
			toPostgresColumnName(fieldName),
			targetTable,
			'id',
		),
		fieldName,
		onDelete,
		targetSchema,
	})
}

const preparePostgresSchema = (
	schema: SchemaDefinition,
	targets: SchemaTargetGraph | undefined,
	resolveTargetId: (schema: SchemaDefinition) => PgColumn,
): PreparedPostgresSchema => {
	const validationPlan = compileValidationPlans(schema).create
	const builders: [string, AnyPgColumnBuilder][] = []
	const pendingFields: [string, Omit<CompiledPostgresField, 'column'>][] = []
	const pointers: PreparedPostgresPointer[] = []
	const storageByField = new Map<string, PostgresStorageKind>()
	// To-many relations own edge storage and never become row columns.
	const storedFieldNames = Object.entries(validationPlan.fields)
		.filter(([, plan]) => plan.field.kind !== 'relation')
		.map(([fieldName]) => fieldName)
	const columnNames = new Set(storedFieldNames.map(toPostgresColumnName))
	const renameSources = new Set<string>()

	assertDistinctPostgresColumns(schema.className, storedFieldNames)

	for (const [fieldName, plan] of Object.entries(validationPlan.fields)) {
		if (plan.field.kind === 'relation') continue

		assertNoNestedRenames(plan, fieldName)
		const pointer = resolvePointerMetadata(schema, fieldName, plan, targets)
		const compiled = compilePostgresFieldBuilder(
			fieldName,
			plan,
			pointer === undefined ? undefined : { target: pointer.targetSchema },
		)
		const renamedFrom = resolvePostgresRenamedFrom(plan.field)

		if (renamedFrom !== undefined) {
			// renamedFrom names the previous physical column (ADR-0320).
			if (columnNames.has(renamedFrom)) {
				throw new TypeError(
					`PostgreSQL renamedFrom must not be a declared field: ${renamedFrom}`,
				)
			}

			if (renameSources.has(renamedFrom)) {
				throw new TypeError(
					`Duplicate PostgreSQL renamedFrom source: ${renamedFrom}`,
				)
			}

			renameSources.add(renamedFrom)
		}

		if (pointer !== undefined) pointers.push(pointer)

		builders.push([fieldName, compiled.builder])
		storageByField.set(fieldName, compiled.storage)
		pendingFields.push([
			fieldName,
			{
				...(compiled.generation === undefined
					? {}
					: { generation: compiled.generation }),
				plan,
				...(renamedFrom === undefined ? {} : { renamedFrom }),
				storage: compiled.storage,
			},
		])
	}

	const tableName = resolvePostgresTableName(schema)
	const table = pgTable(tableName, Object.fromEntries(builders), (columns) => [
		...compilePostgresIndexBuilders(
			tableName,
			schema.definition.indexes,
			columns,
			storageByField,
		),
		...pointers.map((pointer) =>
			foreignKey({
				columns: [
					required(
						columns[pointer.fieldName],
						`PostgreSQL pointer column is unavailable: ${pointer.fieldName}`,
					),
				],
				foreignColumns: [resolveTargetId(pointer.targetSchema)],
				name: pointer.constraintName,
			}).onDelete(pointer.onDelete),
		),
	])

	return { pendingFields, schema, table, tableName }
}

const finalizePostgresSchema = ({
	pendingFields,
	schema,
	table,
	tableName,
}: PreparedPostgresSchema): CompiledPostgresSchema => {
	// Reading the configuration also evaluates indexes and foreign keys, so
	// invalid declarations fail here. Drizzle's table keys are not read: a
	// `__proto__` field corrupts them.
	const columns = new Map(
		getTableConfig(table).columns.map((column) => [column.name, column]),
	)
	const fields = Object.fromEntries(
		pendingFields.map(([fieldName, pending]) => [
			fieldName,
			immutableRecord({
				...pending,
				column: required(
					columns.get(toPostgresColumnName(fieldName)),
					`Drizzle omitted PostgreSQL field: ${fieldName}`,
				),
			}),
		]),
	)

	return immutableRecord({
		definition: schema,
		fields: immutableRecord(fields),
		table,
		tableName,
	})
}

/** Compiles one closed schema graph in two phases so circular pointers stay valid. */
export const compilePostgresSchemas = (
	schemas: readonly SchemaDefinition[],
	targets?: SchemaTargetGraph,
): readonly CompiledPostgresSchema[] => {
	const tables = new Map<SchemaDefinition, PgTable>()
	// Drizzle evaluates table callbacks lazily, after every table below exists.
	const resolveTargetId = (target: SchemaDefinition): PgColumn =>
		required(
			getColumns(
				required(
					tables.get(target),
					`PostgreSQL pointer target is not registered: ${target.className}`,
				),
			).id,
			`PostgreSQL pointer target has no id column: ${target.className}`,
		)
	const prepared = schemas.map((schema) => {
		const plan = preparePostgresSchema(schema, targets, resolveTargetId)

		tables.set(schema, plan.table)
		return plan
	})

	return immutableArray(prepared.map(finalizePostgresSchema))
}
