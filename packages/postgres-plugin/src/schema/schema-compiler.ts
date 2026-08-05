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
	type PgTableExtraConfigValue,
	type UpdateDeleteAction,
} from 'drizzle-orm/pg-core'

import { resolvePostgresRenamedFrom } from '../naming/column.js'
import { createPostgresForeignKeyName } from '../naming/foreign-key.js'
import { resolvePostgresTableName } from '../naming/table.js'
import type {
	CompiledPostgresField,
	CompiledPostgresSchema,
} from './contracts.js'
import { compilePostgresFieldBuilder } from './field-compiler.js'
import { compilePostgresIndexBuilders } from './index-compiler.js'

const hasIndex = (plan: FieldValidationPlan): boolean =>
	'indexed' in plan.field.options &&
	(plan.field.options.indexed === true ||
		plan.field.options.indexed === 'unique')

const assertNoNestedIndexes = (
	plan: FieldValidationPlan,
	path: string,
): void => {
	if (plan.kind === 'array') {
		assertNoNestedIndexes(plan.items, path)
		return
	}

	if (plan.kind !== 'object') {
		return
	}

	for (const [name, child] of Object.entries(plan.fields)) {
		const childPath = `${path}.${name}`

		if (hasIndex(child)) {
			throw new TypeError(
				`PostgreSQL cannot compile nested index without an extension: ${childPath}`,
			)
		}

		if (resolvePostgresRenamedFrom(child.field) !== undefined) {
			throw new TypeError(
				`PostgreSQL renamedFrom requires a top-level column: ${childPath}`,
			)
		}

		assertNoNestedIndexes(child, childPath)
	}
}

const indexColumnsByName = (
	columns: readonly PgColumn[],
): Readonly<Record<string, PgColumn>> =>
	immutableRecord(
		Object.fromEntries(
			columns.map((column) => [column.name, column]),
		) as Record<string, PgColumn>,
	)

interface PreparedPostgresSchema {
	readonly definition: SchemaDefinition['definition']
	readonly schema: SchemaDefinition
	readonly pendingFields: readonly [
		string,
		Omit<CompiledPostgresField, 'column'>,
	][]
	readonly table: PgTable
	readonly tableName: string
}

interface PreparedPostgresPointer {
	readonly constraintName: string
	readonly onDelete: PointerReferentialAction
	readonly targetSchema: SchemaDefinition
}

const postgresReferentialActions: Readonly<
	Record<PointerReferentialAction, UpdateDeleteAction>
> = immutableRecord({
	cascade: 'cascade',
	restrict: 'restrict',
	setNull: 'set null',
})

const readPointerReferentialAction = (
	plan: FieldValidationPlan,
	fieldName: string,
): PointerReferentialAction => {
	const action: unknown = Reflect.get(plan.field.options, 'onDelete')

	if (action !== 'restrict' && action !== 'cascade' && action !== 'setNull') {
		throw new TypeError(
			`PostgreSQL pointer has invalid onDelete metadata: ${fieldName}`,
		)
	}

	return action
}

const resolvePointerMetadata = (
	schema: SchemaDefinition,
	fieldName: string,
	plan: FieldValidationPlan,
	targets: SchemaTargetGraph | undefined,
): PreparedPostgresPointer | undefined => {
	if (plan.kind !== 'scalar' || plan.field.kind !== 'pointer') return undefined

	const targetSchema = targets?.get(schema, [fieldName])

	if (targetSchema === undefined) {
		throw new TypeError(
			`PostgreSQL pointer target is unavailable: ${schema.className}.${fieldName}`,
		)
	}

	const targetTable = resolvePostgresTableName(targetSchema.definition)
	const onDelete = readPointerReferentialAction(plan, fieldName)
	const tableName = resolvePostgresTableName(schema.definition)

	return immutableRecord({
		constraintName: createPostgresForeignKeyName(
			tableName,
			fieldName,
			targetTable,
			'id',
		),
		onDelete,
		targetSchema,
	})
}

const compilePointerConstraints = (
	columns: Readonly<Record<string, PgColumn>>,
	pointers: readonly [string, PreparedPostgresPointer][],
	resolveTargetColumn: (schema: SchemaDefinition) => PgColumn,
): PgTableExtraConfigValue[] =>
	pointers.map(([fieldName, pointer]) => {
		const sourceColumn = columns[fieldName]

		if (sourceColumn === undefined) {
			throw new TypeError(
				`PostgreSQL pointer column is unavailable: ${fieldName}`,
			)
		}

		return foreignKey({
			columns: [sourceColumn],
			foreignColumns: [resolveTargetColumn(pointer.targetSchema)],
			name: pointer.constraintName,
		}).onDelete(postgresReferentialActions[pointer.onDelete])
	})

const preparePostgresSchema = (
	schema: SchemaDefinition,
	targets: SchemaTargetGraph | undefined,
	resolveTargetColumn: (schema: SchemaDefinition) => PgColumn,
): PreparedPostgresSchema => {
	const definition = schema.definition
	const validationPlan = compileValidationPlans(schema).create
	const builderEntries: [string, AnyPgColumnBuilder][] = []
	const pendingFields: [string, Omit<CompiledPostgresField, 'column'>][] = []
	const pointerEntries: [string, PreparedPostgresPointer][] = []
	const fieldNames = new Set(Object.keys(validationPlan.fields))
	const renameSources = new Set<string>()

	for (const [fieldName, plan] of Object.entries(validationPlan.fields)) {
		// To-many relations own edge storage and never become row columns.
		if (plan.field.kind === 'relation') continue

		assertNoNestedIndexes(plan, fieldName)
		const pointer = resolvePointerMetadata(schema, fieldName, plan, targets)
		const compiled = compilePostgresFieldBuilder(
			fieldName,
			plan,
			pointer === undefined ? undefined : { target: pointer.targetSchema },
		)
		const renamedFrom = resolvePostgresRenamedFrom(plan.field)

		if (renamedFrom !== undefined) {
			if (renamedFrom === fieldName || fieldNames.has(renamedFrom)) {
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

		if (pointer !== undefined) pointerEntries.push([fieldName, pointer])

		builderEntries.push([fieldName, compiled.builder])
		pendingFields.push([
			fieldName,
			{
				codec: compiled.codec,
				...(compiled.generation === undefined
					? {}
					: { generation: compiled.generation }),
				plan,
				...(renamedFrom === undefined ? {} : { renamedFrom }),
				storage: compiled.storage,
			},
		])
	}

	const builders = Object.fromEntries(builderEntries) as Record<
		string,
		AnyPgColumnBuilder
	>
	const tableName = resolvePostgresTableName(definition)
	const storageByField = immutableRecord(
		Object.fromEntries(
			pendingFields.map(([fieldName, field]) => [fieldName, field.storage]),
		) as Record<string, CompiledPostgresField['storage']>,
	)
	const table = pgTable(tableName, builders, (columns) => [
		...compilePostgresIndexBuilders(
			tableName,
			definition.indexes,
			columns,
			storageByField,
		),
		...compilePointerConstraints(columns, pointerEntries, resolveTargetColumn),
	])

	return { definition, pendingFields, schema, table, tableName }
}

const finalizePostgresSchema = (
	prepared: PreparedPostgresSchema,
): CompiledPostgresSchema => {
	const { pendingFields, schema, table, tableName } = prepared
	const tableConfig = getTableConfig(table)
	const columns = indexColumnsByName(tableConfig.columns)
	const fields = immutableRecord(
		Object.fromEntries(
			pendingFields.map(([fieldName, pending]) => {
				const column = columns[fieldName]

				if (column === undefined) {
					throw new TypeError(`Drizzle omitted PostgreSQL field: ${fieldName}`)
				}

				return [fieldName, immutableRecord({ ...pending, column })]
			}),
		) as Record<string, CompiledPostgresField>,
	)

	return immutableRecord({
		definition: schema,
		fields,
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
	const resolveTargetColumn = (target: SchemaDefinition): PgColumn => {
		const table = tables.get(target)

		if (table === undefined) {
			throw new TypeError(
				`PostgreSQL pointer target is not registered: ${target.className}`,
			)
		}

		const id = getColumns(table).id

		if (id === undefined) {
			throw new TypeError(
				`PostgreSQL pointer target has no id column: ${target.className}`,
			)
		}

		return id
	}
	const prepared = schemas.map((schema) => {
		const plan = preparePostgresSchema(schema, targets, resolveTargetColumn)

		tables.set(schema, plan.table)
		return plan
	})

	return immutableArray(prepared.map(finalizePostgresSchema))
}

/** Compiles one static schema into the private Drizzle plan shared by PostgreSQL stages. */
export const compilePostgresSchema = (
	schema: SchemaDefinition,
	targets?: SchemaTargetGraph,
): CompiledPostgresSchema => {
	const compiled = compilePostgresSchemas([schema], targets)[0]

	if (compiled === undefined) {
		throw new TypeError('PostgreSQL schema compilation returned no schema')
	}

	return compiled
}
