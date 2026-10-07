import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { GenericField } from '../fields/base/contract.js'
import type { ValidationIssue, ValidationIssuePath } from './contracts.js'

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

const createIssue = (
	code: 'decimal.precision' | 'decimal.scale' | 'uuid.type',
	path: ValidationIssuePath,
	message: string,
): ValidationIssue =>
	immutableRecord({ code, path: immutableArray(path), message })

/** Resolves the declared temporal representation without coupling it to validation. */
export const fieldUsesTemporalTimezone = (field: GenericField): boolean =>
	field.kind === 'dateTime'
		? !('timezone' in field.options) || field.options.timezone !== false
		: field.kind === 'time' &&
			'timezone' in field.options &&
			field.options.timezone === true

/** Enforces field shape metadata that remains authoritative independently of validators. */
export const validateScalarFieldShape = (
	field: GenericField,
	value: unknown,
	path: ValidationIssuePath,
): readonly ValidationIssue[] => {
	if (field.kind === 'uuid' && typeof value === 'string') {
		return uuidPattern.test(value)
			? immutableArray([])
			: immutableArray([
					createIssue('uuid.type', path, 'Value must be a valid UUID'),
				])
	}

	if (field.kind !== 'decimal' || typeof value !== 'string') {
		return immutableArray([])
	}

	const unsigned = value.startsWith('-') ? value.slice(1) : value
	const [integer = '', fraction = ''] = unsigned.split('.')
	const precision = integer.length + fraction.length
	const issues: ValidationIssue[] = []

	if (
		'precision' in field.options &&
		typeof field.options.precision === 'number' &&
		precision > field.options.precision
	) {
		issues.push(
			createIssue(
				'decimal.precision',
				path,
				`Value precision must not exceed ${String(field.options.precision)}`,
			),
		)
	}

	if (
		'scale' in field.options &&
		typeof field.options.scale === 'number' &&
		fraction.length > field.options.scale
	) {
		issues.push(
			createIssue(
				'decimal.scale',
				path,
				`Value scale must not exceed ${String(field.options.scale)}`,
			),
		)
	}

	return immutableArray(issues)
}
