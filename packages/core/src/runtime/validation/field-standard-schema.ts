import { deepEqual } from 'fast-equals'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { FrameworkError } from '../../foundation.js'
import type {
	GenericField,
	ValidationIssue,
	ValidationIssuePath,
} from '../../schema/index.js'
import { Pointer } from '../../schema/index.js'

const isObjectOrFunction = (value: unknown): value is object =>
	(typeof value === 'object' && value !== null) || typeof value === 'function'

const isPromiseLike = (value: unknown): boolean =>
	isObjectOrFunction(value) && typeof Reflect.get(value, 'then') === 'function'

const equalCanonicalValues = (left: unknown, right: unknown): boolean => {
	if (Pointer.is(left) || Pointer.is(right)) {
		return Pointer.is(left) && left.equals(right)
	}

	return deepEqual(left, right)
}

const contractFailure = (
	path: ValidationIssuePath,
	message: string,
	cause?: unknown,
): never => {
	const displayPath = path.map(String).join('.') || '<root>'

	throw new FrameworkError(
		'INTERNAL_ERROR',
		`Field validator contract failed at ${displayPath}: ${message}`,
		{
			...(cause === undefined ? {} : { cause }),
			internalDetails: immutableRecord({ path: immutableArray(path) }),
		},
	)
}

const readPathKey = (
	segment: unknown,
	fieldPath: ValidationIssuePath,
): number | string => {
	const key =
		isPlainRecord(segment) && Object.hasOwn(segment, 'key')
			? segment.key
			: segment

	if (typeof key === 'number' || typeof key === 'string') {
		return key
	}

	if (typeof key === 'symbol') {
		return String(key)
	}

	return contractFailure(fieldPath, 'an issue path contains an invalid segment')
}

const snapshotIssues = (
	issues: unknown,
	fieldPath: ValidationIssuePath,
): readonly ValidationIssue<'field.validation'>[] => {
	if (!isUnknownArray(issues)) {
		return contractFailure(fieldPath, 'the failure result has no issue array')
	}

	if (issues.length === 0) {
		return immutableArray([
			immutableRecord({
				code: 'field.validation' as const,
				message: 'Value does not satisfy the field validator',
				path: immutableArray(fieldPath),
			}),
		])
	}

	return immutableArray(
		issues.map((issue) => {
			if (!isPlainRecord(issue) || typeof issue.message !== 'string') {
				return contractFailure(
					fieldPath,
					'the validator returned a malformed issue',
				)
			}

			const relativePath =
				issue.path === undefined
					? []
					: isUnknownArray(issue.path)
						? issue.path.map((segment) => readPathKey(segment, fieldPath))
						: contractFailure(
								fieldPath,
								'an issue path must be an array when provided',
							)

			return immutableRecord({
				code: 'field.validation' as const,
				message: issue.message,
				path: immutableArray([...fieldPath, ...relativePath]),
			})
		}),
	)
}

/** Runs one opaque validator as a synchronous, rejection-only Standard Schema boundary. */
export const validateFieldStandardSchema = (
	field: GenericField,
	value: unknown,
	path: ValidationIssuePath,
): readonly ValidationIssue<'field.validation'>[] => {
	if (
		!('validation' in field.options) ||
		field.options.validation === undefined
	) {
		return immutableArray([])
	}

	const validator: unknown = field.options.validation

	if (!isObjectOrFunction(validator)) {
		return contractFailure(
			path,
			'the retained validator is not an object or function',
		)
	}

	const protocol: unknown = Reflect.get(validator, '~standard')

	if (
		!isObjectOrFunction(protocol) ||
		Reflect.get(protocol, 'version') !== 1 ||
		typeof Reflect.get(protocol, 'vendor') !== 'string'
	) {
		return contractFailure(
			path,
			'the retained Standard Schema V1 protocol is malformed',
		)
	}

	const validate: unknown = Reflect.get(protocol, 'validate')

	if (typeof validate !== 'function') {
		return contractFailure(
			path,
			'the retained validator has no validate function',
		)
	}

	let result: unknown

	try {
		result = Reflect.apply(validate, protocol, [value])
	} catch (error: unknown) {
		return contractFailure(path, 'validate threw an exception', error)
	}

	if (isPromiseLike(result)) {
		return contractFailure(path, 'async validation is not supported')
	}

	if (!isPlainRecord(result)) {
		return contractFailure(path, 'validate returned a malformed result')
	}

	if (result.issues !== undefined) {
		return snapshotIssues(result.issues, path)
	}

	if (!Object.hasOwn(result, 'value')) {
		return contractFailure(path, 'the success result has no value')
	}

	if (!equalCanonicalValues(value, result.value)) {
		return contractFailure(path, 'field validators cannot transform values')
	}

	return immutableArray([])
}
