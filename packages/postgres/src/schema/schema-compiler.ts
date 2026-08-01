import {
	compileValidationPlans,
	type FieldValidationPlan,
	type SchemaDefinition,
} from '@ultimabase/schema'
import { immutableRecord } from '@ultimabase/shared'
import {
	getTableConfig,
	pgTable,
	type PgColumn,
	type PgColumnBuilderBase,
} from 'drizzle-orm/pg-core'

import { resolvePostgresTableName } from '../naming/table.js'
import type {
	CompiledPostgresField,
	CompiledPostgresSchema,
} from './contracts.js'
import { compilePostgresFieldBuilder } from './field-compiler.js'

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

	for (const [fieldName, plan] of Object.entries(validationPlan.fields)) {
		assertNoNestedIndexes(plan, fieldName)
		const compiled = compilePostgresFieldBuilder(fieldName, plan)

		builderEntries.push([fieldName, compiled.builder])
		pendingFields.push([
			fieldName,
			{
				codec: compiled.codec,
				...(compiled.generation === undefined
					? {}
					: { generation: compiled.generation }),
				plan,
				storage: compiled.storage,
			},
		])
	}

	const builders = Object.fromEntries(builderEntries) as Record<
		string,
		PgColumnBuilderBase
	>
	const table = pgTable(resolvePostgresTableName(schema), builders)
	const columns = indexColumnsByName(getTableConfig(table).columns)
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

	return immutableRecord({ fields, table })
}
