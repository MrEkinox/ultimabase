import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { GenericField } from '../fields/base/contract.js'
import { compareZonedDateTimeValues } from '../fields/builtins/date-time.js'
import { compareDecimalValues } from '../fields/builtins/decimal.js'
import { compareZonedTimeValues } from '../fields/builtins/time.js'
import { compareCanonicalTemporalValues } from '../fields/constraints/temporal.js'
import type {
	ValidationIssue,
	ValidationIssueCode,
	ValidationIssuePath,
} from './contracts.js'

type ScalarConstraintValue = bigint | number | string

const isScalarConstraintValue = (
	value: unknown,
): value is ScalarConstraintValue =>
	typeof value === 'bigint' ||
	typeof value === 'number' ||
	typeof value === 'string'

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const emptyValidation: Readonly<Record<string, unknown>> = immutableRecord({})

const createIssue = (
	code: ValidationIssueCode,
	path: ValidationIssuePath,
	message: string,
): ValidationIssue =>
	immutableRecord({ code, path: immutableArray(path), message })

const readValidation = (
	field: GenericField,
): Readonly<Record<string, unknown>> | undefined => {
	if (!('validation' in field.options)) {
		return undefined
	}

	return isPlainRecord(field.options.validation)
		? field.options.validation
		: undefined
}

/** Resolves the declared temporal representation without duplicating factory defaults. */
export const fieldUsesTemporalTimezone = (field: GenericField): boolean =>
	field.kind === 'dateTime'
		? !('timezone' in field.options) || field.options.timezone !== false
		: field.kind === 'time' &&
			'timezone' in field.options &&
			field.options.timezone === true

const appendLengthIssues = (
	issues: ValidationIssue[],
	validation: Readonly<Record<string, unknown>>,
	value: string | Uint8Array,
	path: ValidationIssuePath,
	prefix: 'binary' | 'string',
): void => {
	if (!isPlainRecord(validation.length)) {
		return
	}

	if (
		typeof validation.length.min === 'number' &&
		value.length < validation.length.min
	) {
		issues.push(
			createIssue(
				`${prefix}.length.min`,
				path,
				`Value must contain at least ${String(validation.length.min)} ${prefix === 'binary' ? 'bytes' : 'characters'}`,
			),
		)
	}

	if (
		typeof validation.length.max === 'number' &&
		value.length > validation.length.max
	) {
		issues.push(
			createIssue(
				`${prefix}.length.max`,
				path,
				`Value must contain at most ${String(validation.length.max)} ${prefix === 'binary' ? 'bytes' : 'characters'}`,
			),
		)
	}
}

const appendOrderedRangeIssues = (
	issues: ValidationIssue[],
	validation: Readonly<Record<string, unknown>>,
	value: ScalarConstraintValue,
	path: ValidationIssuePath,
	prefix: 'bigint' | 'date' | 'dateTime' | 'decimal' | 'float' | 'int' | 'time',
	compare: (
		left: ScalarConstraintValue,
		right: ScalarConstraintValue,
	) => number,
): void => {
	if (!isPlainRecord(validation.range)) {
		return
	}

	const { min, max } = validation.range

	if (isScalarConstraintValue(min) && compare(value, min) < 0) {
		issues.push(
			createIssue(
				`${prefix}.range.min`,
				path,
				`Value must be greater than or equal to ${String(min)}`,
			),
		)
	}

	if (isScalarConstraintValue(max) && compare(value, max) > 0) {
		issues.push(
			createIssue(
				`${prefix}.range.max`,
				path,
				`Value must be less than or equal to ${String(max)}`,
			),
		)
	}
}

const comparePrimitiveValues = (
	left: ScalarConstraintValue,
	right: ScalarConstraintValue,
): number => (left < right ? -1 : left > right ? 1 : 0)

const appendDecimalIssues = (
	issues: ValidationIssue[],
	validation: Readonly<Record<string, unknown>>,
	value: string,
	path: ValidationIssuePath,
): void => {
	const unsigned = value.startsWith('-') ? value.slice(1) : value
	const [integer = '', fraction = ''] = unsigned.split('.')
	const precision = integer.length + fraction.length

	if (
		typeof validation.precision === 'number' &&
		precision > validation.precision
	) {
		issues.push(
			createIssue(
				'decimal.precision',
				path,
				`Value precision must not exceed ${String(validation.precision)}`,
			),
		)
	}

	if (
		typeof validation.scale === 'number' &&
		fraction.length > validation.scale
	) {
		issues.push(
			createIssue(
				'decimal.scale',
				path,
				`Value scale must not exceed ${String(validation.scale)}`,
			),
		)
	}

	appendOrderedRangeIssues(
		issues,
		validation,
		value,
		path,
		'decimal',
		(left, right) => compareDecimalValues(String(left), String(right)),
	)
}

const appendTemporalIssues = (
	issues: ValidationIssue[],
	field: GenericField,
	validation: Readonly<Record<string, unknown>>,
	value: string,
	path: ValidationIssuePath,
): void => {
	const timezone = fieldUsesTemporalTimezone(field)
	const compare =
		field.kind === 'dateTime' && timezone
			? compareZonedDateTimeValues
			: field.kind === 'time' && timezone
				? compareZonedTimeValues
				: compareCanonicalTemporalValues
	const prefix =
		field.kind === 'dateTime'
			? 'dateTime'
			: field.kind === 'time'
				? 'time'
				: 'date'

	appendOrderedRangeIssues(
		issues,
		validation,
		value,
		path,
		prefix,
		(left, right) => compare(String(left), String(right)),
	)
}

/** Evaluates built-in declarative constraints after a scalar capability snapshot. */
export const validateScalarFieldConstraints = (
	field: GenericField,
	value: unknown,
	path: ValidationIssuePath,
): readonly ValidationIssue[] => {
	// Built-in scalar shape validation must still run when no value constraint
	// object is declared, notably for generated system UUID values.
	const validation = readValidation(field) ?? emptyValidation

	const issues: ValidationIssue[] = []

	switch (field.kind) {
		case 'string':
			if (typeof value === 'string') {
				appendLengthIssues(issues, validation, value, path, 'string')

				if (validation.match instanceof RegExp) {
					const pattern = new RegExp(
						validation.match.source,
						validation.match.flags,
					)

					if (!pattern.test(value)) {
						issues.push(
							createIssue(
								'string.match',
								path,
								'Value does not match the declared pattern',
							),
						)
					}
				}
			}
			break
		case 'binary':
			if (value instanceof Uint8Array) {
				appendLengthIssues(issues, validation, value, path, 'binary')
			}
			break
		case 'int':
		case 'float':
			if (typeof value === 'number') {
				if (
					field.kind === 'float' &&
					validation.finite === true &&
					!Number.isFinite(value)
				) {
					issues.push(createIssue('float.finite', path, 'Value must be finite'))
				}

				appendOrderedRangeIssues(
					issues,
					validation,
					value,
					path,
					field.kind,
					comparePrimitiveValues,
				)
			}
			break
		case 'bigint':
			if (typeof value === 'bigint') {
				appendOrderedRangeIssues(
					issues,
					validation,
					value,
					path,
					'bigint',
					comparePrimitiveValues,
				)
			}
			break
		case 'decimal':
			if (typeof value === 'string') {
				appendDecimalIssues(issues, validation, value, path)
			}
			break
		case 'date':
		case 'dateTime':
		case 'time':
			if (typeof value === 'string') {
				appendTemporalIssues(issues, field, validation, value, path)
			}
			break
		case 'uuid':
			if (typeof value === 'string') {
				if (!uuidPattern.test(value)) {
					issues.push(
						createIssue('uuid.type', path, 'Value must be a valid UUID'),
					)
				} else if (
					typeof validation.version === 'number' &&
					Number(value[14]) !== validation.version
				) {
					issues.push(
						createIssue(
							'uuid.version',
							path,
							`Value must be UUID version ${String(validation.version)}`,
						),
					)
				}
			}
			break
	}

	return immutableArray(issues)
}
