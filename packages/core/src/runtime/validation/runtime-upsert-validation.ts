import type { QueryAst, UniqueUpsertTargetNode } from '../../query/index.js'
import { isDeepStrictEqual } from 'node:util'
import { readUniqueUpsertTargetValues } from '../../query/operations/upsert.js'
import {
	type SchemaValidationPlan,
	type ValidationIssuePath,
} from '../../schema/index.js'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import {
	validateFieldValue,
	validateSchemaInput,
	type ValidationExecution,
} from './runtime-field-validation.js'
import { appendIssue } from './runtime-validation-errors.js'

interface PreparedUpsertCreateInput {
	readonly input: Readonly<Record<string, unknown>>
	readonly targetValues: Readonly<Record<string, unknown>>
}

/** Seeds developer-owned target fields before required-value validation runs. */
const prepareUpsertCreateInput = (
	suppliedCreate: unknown,
	query: unknown,
	target: unknown,
	path: ValidationIssuePath,
	execution: ValidationExecution,
	createPlan: SchemaValidationPlan,
): PreparedUpsertCreateInput | undefined => {
	if (!isPlainRecord(query) || !isPlainRecord(target)) {
		appendIssue(
			execution,
			'upsert.target',
			path,
			'Upsert target must contain a normalized query and unique key',
		)

		return undefined
	}

	let targetValues: Readonly<Record<string, unknown>>

	try {
		targetValues = readUniqueUpsertTargetValues(
			query as unknown as QueryAst,
			target as unknown as UniqueUpsertTargetNode,
		)
	} catch {
		appendIssue(
			execution,
			'upsert.target',
			path,
			'Upsert target does not match its equality query',
		)

		return undefined
	}

	if (!isPlainRecord(suppliedCreate)) {
		appendIssue(
			execution,
			'object.type',
			path,
			'Upsert create candidate must be a plain object',
		)

		return undefined
	}

	const input: Record<string, unknown> = { ...suppliedCreate }
	let valid = true

	for (const [fieldName, value] of Object.entries(targetValues)) {
		const fieldPlan = createPlan.fields[fieldName]

		if (fieldPlan === undefined) {
			valid = false
			appendIssue(
				execution,
				'field.unknown',
				[...path, fieldName],
				'Upsert target field is not declared by the schema',
			)
			continue
		}

		if (
			Object.hasOwn(suppliedCreate, fieldName) &&
			!isDeepStrictEqual(suppliedCreate[fieldName], value)
		) {
			valid = false
			appendIssue(
				execution,
				'upsert.target',
				[...path, fieldName],
				'Create value must match its unique upsert target',
			)
		}

		if (fieldPlan.presence !== 'forbidden') {
			// Required developer fields are present before the regular create validator.
			input[fieldName] = value
		}
	}

	if (!valid) {
		return undefined
	}

	return immutableRecord({
		input: immutableRecord(input),
		targetValues,
	})
}

/** Applies every validated target value, including reserved generated identity. */
const reconcileUpsertCreateTarget = (
	create: Readonly<Record<string, unknown>>,
	targetValues: Readonly<Record<string, unknown>>,
	path: ValidationIssuePath,
	execution: ValidationExecution,
	createPlan: SchemaValidationPlan,
): Readonly<Record<string, unknown>> | undefined => {
	const reconciled: Record<string, unknown> = { ...create }
	let valid = true

	for (const [fieldName, value] of Object.entries(targetValues)) {
		const fieldPlan = createPlan.fields[fieldName]

		if (fieldPlan === undefined) {
			valid = false
			continue
		}

		const fieldResult = validateFieldValue(
			fieldPlan,
			value,
			[...path, fieldName],
			execution,
			false,
		)

		if (!fieldResult.valid) {
			valid = false
			continue
		}

		// The query remains authoritative over generated values such as an id.
		reconciled[fieldName] = fieldResult.value
	}

	return valid ? immutableRecord(reconciled) : undefined
}

/** Runs target seeding and ordinary create validation through one shared path. */
export const validateUpsertCreateInput = (
	suppliedCreate: unknown,
	query: unknown,
	target: unknown,
	path: ValidationIssuePath,
	execution: ValidationExecution,
	createPlan: SchemaValidationPlan,
	allowDefaults: boolean,
): Readonly<Record<string, unknown>> | undefined => {
	const prepared = prepareUpsertCreateInput(
		suppliedCreate,
		query,
		target,
		path,
		execution,
		createPlan,
	)

	if (prepared === undefined) {
		return undefined
	}

	const validated = validateSchemaInput(
		createPlan,
		prepared.input,
		path,
		execution,
		allowDefaults,
	)

	return validated === undefined
		? undefined
		: reconcileUpsertCreateTarget(
				validated,
				prepared.targetValues,
				path,
				execution,
				createPlan,
			)
}
