import {
	compileValidationPlans,
	type FieldValidationPlan,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'
import {
	getTableConfig,
	pgTable,
	type PgColumn,
	type PgColumnBuilderBase,
} from 'drizzle-orm/pg-core'

import { resolvePostgresRenamedFrom } from '../naming/column.js'
import { resolvePostgresTableName } from '../naming/table.js'
import type {
	CompiledPostgresField,
	CompiledPostgresIndex,
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

/** Compiles one static schema into the private Drizzle plan shared by PostgreSQL stages. */
export const compilePostgresSchema = (
	schema: SchemaDefinition,
): CompiledPostgresSchema => {
	const validationPlan = compileValidationPlans(schema).create
	const builderEntries: [string, PgColumnBuilderBase][] = []
	const pendingFields: [string, Omit<CompiledPostgresField, 'column'>][] = []
	const fieldNames = new Set(Object.keys(validationPlan.fields))
	const renameSources = new Set<string>()

	for (const [fieldName, plan] of Object.entries(validationPlan.fields)) {
		assertNoNestedIndexes(plan, fieldName)
		const compiled = compilePostgresFieldBuilder(fieldName, plan)
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
		PgColumnBuilderBase
	>
	const tableName = resolvePostgresTableName(schema)
	const table = pgTable(tableName, builders, (columns) =>
		compilePostgresIndexBuilders(tableName, schema.indexes, columns),
	)
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

	const indexes = immutableArray(
		schema.indexes.map((definition, position): CompiledPostgresIndex => {
			const compiledIndex = tableConfig.indexes[position]
			const name = compiledIndex?.config.name

			if (compiledIndex === undefined || name === undefined) {
				throw new TypeError(
					`Drizzle omitted PostgreSQL index at position: ${String(position)}`,
				)
			}

			return immutableRecord({
				fields: definition.fields,
				index: compiledIndex,
				name,
				unique: definition.unique,
			})
		}),
	)

	return immutableRecord({ fields, indexes, table, tableName })
}
