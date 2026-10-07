import { FrameworkError } from '../../foundation.js'
import {
	fieldUsesTemporalTimezone,
	snapshotScalarFieldValue,
	type AnyValidationIssueCode,
	type FieldValidationPlan,
	type GenericField,
	type SchemaValidationPlan,
	type ValidationIssue,
	type ValidationIssuePath,
} from '../../schema/index.js'
import { validateScalarFieldShape } from '../../schema/plans/scalar-shape-validation.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import type { OperationTemporalValues } from './operation-clock.js'
import type { UuidV7Generator } from './identifier-generator.js'

interface ValidationIssueSink {
	readonly issues: ValidationIssue<AnyValidationIssueCode>[]
}

/** Keeps Runtime validation errors compatible with schema and behavior issue codes. */
export interface RuntimeValidationIssue {
	readonly code: string
	readonly message: string
	readonly path: ValidationIssuePath
}

/** Describes the trusted diagnostic and safe public message for one boundary. */
export interface RuntimeValidationErrorDescription {
	readonly internalMessage: string
	readonly publicMessage: string
}

const createIssue = (
	code: AnyValidationIssueCode,
	path: ValidationIssuePath,
	message: string,
): ValidationIssue<AnyValidationIssueCode> =>
	immutableRecord({ code, path: immutableArray(path), message })

export const appendIssue = (
	execution: ValidationIssueSink,
	code: AnyValidationIssueCode,
	path: ValidationIssuePath,
	message: string,
): void => {
	execution.issues.push(createIssue(code, path, message))
}

/** Raises one consistent transport-neutral error for structural and behavior issues. */
export const throwRuntimeValidationIssues = (
	issues: readonly RuntimeValidationIssue[],
	description: Readonly<RuntimeValidationErrorDescription> = {
		internalMessage: 'Operation input validation failed.',
		publicMessage: 'The operation input is invalid.',
	},
): never => {
	const immutableIssues = immutableArray(issues)

	throw new FrameworkError('VALIDATION_ERROR', description.internalMessage, {
		publicMessage: description.publicMessage,
		publicDetails: { issues: immutableIssues },
		internalDetails: { issues: immutableIssues },
	})
}

export interface ValidationExecution {
	readonly issues: ValidationIssue<AnyValidationIssueCode>[]
	readonly temporal: OperationTemporalValues
	readonly timestamp: number
	readonly uuidV7Generator: UuidV7Generator
}

interface ValidValue {
	readonly valid: true
	readonly value: unknown
}

interface InvalidValue {
	readonly valid: false
}

type ValueValidationResult = InvalidValue | ValidValue

interface MissingValue {
	readonly found: false
}

interface ResolvedValue {
	readonly found: true
	readonly value: unknown
}

type MissingValueResolution = MissingValue | ResolvedValue

const readScalarFailureCode = (field: GenericField): AnyValidationIssueCode => {
	switch (field.kind) {
		case 'bigint':
			return 'bigint.type'
		case 'binary':
			return 'binary.type'
		case 'boolean':
			return 'boolean.type'
		case 'date':
			return 'date.invalid'
		case 'dateTime':
			return 'dateTime.invalid'
		case 'decimal':
			return 'decimal.invalid'
		case 'enum':
			return 'enum.value'
		case 'float':
			return 'float.type'
		case 'int':
			return 'int.type'
		case 'json':
			return 'json.type'
		case 'pointer':
			return 'pointer.type'
		case 'string':
			return 'string.type'
		case 'time':
			return 'time.invalid'
		case 'uuid':
			return 'uuid.type'
		default:
			// Plugin field kinds are namespaced, so their generic invalid code remains namespaced.
			return `${field.kind}.invalid` as AnyValidationIssueCode
	}
}

export const snapshotScalarValue = (
	field: GenericField,
	value: unknown,
	path: ValidationIssuePath,
	execution: ValidationExecution,
	constraints: boolean,
): ValueValidationResult => {
	const displayPath = path.map(String).join('.')

	try {
		const snapshot: unknown = snapshotScalarFieldValue(
			field,
			value,
			displayPath,
		)

		if (constraints) {
			execution.issues.push(...validateScalarFieldShape(field, snapshot, path))
		}

		return { valid: true, value: snapshot }
	} catch (error: unknown) {
		appendIssue(
			execution,
			readScalarFailureCode(field),
			path,
			error instanceof Error ? error.message : 'Invalid scalar value',
		)

		return { valid: false }
	}
}

const resolveMissingValue = (
	field: GenericField,
	execution: ValidationExecution,
): MissingValueResolution => {
	if ('default' in field.options) {
		const declaredDefault: unknown = field.options.default

		return {
			found: true,
			value:
				typeof declaredDefault === 'function'
					? (declaredDefault as () => unknown)()
					: declaredDefault,
		}
	}

	if ('autoNow' in field.options && field.options.autoNow === true) {
		const timezone = fieldUsesTemporalTimezone(field)
		const { temporal } = execution

		return {
			found: true,
			value:
				field.kind === 'date'
					? temporal.date
					: field.kind === 'time'
						? timezone
							? temporal.timeWithTimezone
							: temporal.time
						: timezone
							? temporal.dateTimeWithTimezone
							: temporal.dateTime,
		}
	}

	if ('generatedOn' in field.options && field.kind === 'dateTime') {
		return { found: true, value: execution.temporal.dateTimeWithTimezone }
	}

	if (
		'generatedOn' in field.options &&
		field.options.generatedOn === 'create' &&
		field.kind === 'uuid' &&
		'uuidVersion' in field.options &&
		field.options.uuidVersion === 7
	) {
		return {
			found: true,
			value: execution.uuidV7Generator(execution.timestamp),
		}
	}

	// Auto-increment and future database extensions intentionally remain adapter-owned.
	return { found: false }
}

export const validateFieldValue = (
	plan: FieldValidationPlan,
	value: unknown,
	path: ValidationIssuePath,
	execution: ValidationExecution,
	allowDefaults: boolean,
): ValueValidationResult => {
	if (value === null) {
		if (plan.nullable) {
			return { valid: true, value: null }
		}
		appendIssue(execution, 'field.null', path, 'Field cannot be null')
		return { valid: false }
	}
	const result: ValueValidationResult = (() => {
		switch (plan.kind) {
			case 'scalar':
				return snapshotScalarValue(plan.field, value, path, execution, true)
			case 'array': {
				if (!isUnknownArray(value)) {
					appendIssue(execution, 'array.type', path, 'Field must be an array')
					return { valid: false }
				}
				const items: unknown[] = []
				let valid = true
				for (const [index, item] of value.entries()) {
					const itemResult = validateFieldValue(
						plan.items,
						item,
						[...path, index],
						execution,
						allowDefaults,
					)
					valid = valid && itemResult.valid
					if (itemResult.valid) {
						items.push(itemResult.value)
					}
				}
				return valid
					? { valid: true, value: immutableArray(items) }
					: { valid: false }
			}
			case 'object':
				return validateObjectValue(
					plan.fields,
					value,
					path,
					execution,
					allowDefaults,
				)
		}
	})()
	return result
}

const validateObjectValue = (
	fields: Readonly<Record<string, FieldValidationPlan>>,
	value: unknown,
	path: ValidationIssuePath,
	execution: ValidationExecution,
	allowDefaults: boolean,
	resolvedValues?: Readonly<Record<string, unknown>>,
): ValueValidationResult => {
	if (!isPlainRecord(value)) {
		appendIssue(execution, 'object.type', path, 'Value must be a plain object')
		return { valid: false }
	}

	let valid = true
	const entries: [string, unknown][] = []

	for (const key of Object.keys(value)) {
		if (!Object.hasOwn(fields, key)) {
			valid = false
			appendIssue(
				execution,
				'field.unknown',
				[...path, key],
				'Field is not declared by the schema',
			)
		}
	}

	for (const [fieldName, plan] of Object.entries(fields)) {
		const fieldPath: ValidationIssuePath = [...path, fieldName]
		const supplied = Object.hasOwn(value, fieldName)

		if (supplied) {
			if (plan.presence === 'forbidden') {
				valid = false
				appendIssue(
					execution,
					'field.forbidden',
					fieldPath,
					'Field is generated or immutable',
				)
				continue
			}

			const fieldResult = validateFieldValue(
				plan,
				value[fieldName],
				fieldPath,
				execution,
				allowDefaults,
			)

			valid = valid && fieldResult.valid

			if (fieldResult.valid) {
				entries.push([fieldName, fieldResult.value])
			}

			continue
		}

		const resolved = Object.hasOwn(resolvedValues ?? {}, fieldName)
			? { found: true as const, value: resolvedValues?.[fieldName] }
			: allowDefaults
				? resolveMissingValue(plan.field, execution)
				: { found: false as const }

		if (resolved.found) {
			const fieldResult = validateFieldValue(
				plan,
				resolved.value,
				fieldPath,
				execution,
				allowDefaults,
			)

			valid = valid && fieldResult.valid

			if (fieldResult.valid) {
				entries.push([fieldName, fieldResult.value])
			}

			continue
		}

		if (plan.presence === 'required') {
			valid = false
			appendIssue(execution, 'field.required', fieldPath, 'Field is required')
		} else if (plan.presence === 'optional' && allowDefaults && plan.nullable) {
			// Complete create values canonicalize unresolved optional fields to null.
			entries.push([fieldName, null])
		}
	}

	return valid
		? { valid: true, value: immutableRecord(Object.fromEntries(entries)) }
		: { valid: false }
}

export const validateSchemaInput = (
	plan: SchemaValidationPlan,
	value: unknown,
	path: ValidationIssuePath,
	execution: ValidationExecution,
	allowDefaults: boolean,
	resolvedValues?: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | undefined => {
	const result = validateObjectValue(
		plan.fields,
		value,
		path,
		execution,
		allowDefaults,
		resolvedValues,
	)

	return result.valid
		? (result.value as Readonly<Record<string, unknown>>)
		: undefined
}

export const isRequiredOutput = (field: GenericField): boolean =>
	('required' in field.options && field.options.required === true) ||
	'default' in field.options ||
	('autoNow' in field.options && field.options.autoNow === true) ||
	('autoIncrement' in field.options && field.options.autoIncrement === true) ||
	'generatedOn' in field.options
