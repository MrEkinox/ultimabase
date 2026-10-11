import {
	collectRecordFieldValues,
	Schema,
	type CompiledSchemaRegistry,
	type CreateInput,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableArray, immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { runFieldValidator, type ValidationIssue } from './field-validation.js'
import {
	readFieldValidator,
	readSchemaValidation,
} from './operation-validation.js'
import { runSchemaValidation } from './schema-validation.js'

/** What `check()` answers. */
export type ValidationCheckResult =
	| Readonly<{ valid: true }>
	| Readonly<{ valid: false; issues: readonly ValidationIssue[] }>

/** What `ultimabase.plugin(validationPlugin)` returns. */
export interface ValidationPluginExports {
	/**
	 * Runs the field validators and the schema check of a create on `data`,
	 * without writing or a transaction (ADR-0319); paths are those `createOne`
	 * reports. Core's structural checks (required fields, types) are not run.
	 *
	 * @example `const result = await ultimabase.plugin(validationPlugin).check(Todo, { data })`
	 */
	check<TSchema extends SchemaDefinition>(
		schema: TSchema,
		input: Readonly<{ data: CreateInput<TSchema> }>,
	): Promise<ValidationCheckResult>
}

const valid = immutableRecord({ valid: true as const })

/** Creates `check()` for one application's compiled schemas. */
export const createValidationCheck =
	(schemas: CompiledSchemaRegistry): ValidationPluginExports['check'] =>
	async (schema, input) => {
		const compiled = Schema.is(schema)
			? schemas.get(schema.className)
			: undefined
		if (compiled === undefined) {
			throw new TypeError('check() requires a schema of this application')
		}
		const data: unknown = isPlainRecord(input) ? input.data : undefined
		if (!isPlainRecord(data)) {
			throw new TypeError('check() requires { data } with a plain object')
		}
		const issues: ValidationIssue[] = []
		const failed: (readonly (number | string)[])[] = []
		for (const value of collectRecordFieldValues(
			compiled.persistedFields,
			data,
			'children-first',
		)) {
			const validator = readFieldValidator(value.field)
			if (
				validator === undefined ||
				value.value === null ||
				failed.some((path) =>
					path.slice(0, value.valuePath.length).every(
						(segment, index) => segment === value.valuePath[index],
					),
				)
			) {
				continue
			}
			const outcome = await runFieldValidator(validator, value.value, [
				'input',
				...value.valuePath,
			])
			if (outcome.issues.length > 0) {
				issues.push(...outcome.issues)
				failed.push(value.valuePath)
			}
		}
		const validation = readSchemaValidation(compiled)
		if (validation !== undefined) {
			issues.push(...(await runSchemaValidation(validation, data)))
		}
		return issues.length === 0
			? valid
			: immutableRecord({ issues: immutableArray(issues), valid: false as const })
	}
