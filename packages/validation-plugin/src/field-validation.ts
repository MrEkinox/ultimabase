import { FrameworkError, Pointer } from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { deepEqual } from 'fast-equals'

import { isObjectOrFunction, isStandardSchema } from './standard-schema.js'

/** The default code of a field validator's issue. */
export type FieldValidationIssueCode = 'field.validation'

/** One validation problem, as `VALIDATION_ERROR` lists it (ADR-0319). */
export interface ValidationIssue {
	/** `field.validation`, `schema.validation`, or the `code` a validator returned. */
	readonly code: string
	readonly message: string
	readonly path: readonly (number | string)[]
}

/** What one field validator found, and the value to store. */
export interface FieldValidatorOutcome {
	readonly issues: readonly ValidationIssue[]
	/** The validator's output: the stored value when it differs from the input. */
	readonly value: unknown
}

const equalCanonicalValues = (left: unknown, right: unknown): boolean => {
	if (Pointer.is(left) || Pointer.is(right)) {
		return Pointer.is(left) && left.equals(right)
	}
	return deepEqual(left, right)
}

const contractFailure = (
	path: readonly (number | string)[],
	message: string,
	cause?: unknown,
): never => {
	const displayPath = path.map(String).join('.') || '<root>'
	throw new FrameworkError(
		'INTERNAL_ERROR',
		`Validator contract failed at ${displayPath}: ${message}`,
		{
			...(cause === undefined ? {} : { cause }),
			internalDetails: immutableRecord({ path: immutableArray(path) }),
		},
	)
}

const readPathKey = (
	segment: unknown,
	path: readonly (number | string)[],
): number | string => {
	const key =
		isPlainRecord(segment) && Object.hasOwn(segment, 'key')
			? segment.key
			: segment
	if (typeof key === 'number' || typeof key === 'string') return key
	if (typeof key === 'symbol') return String(key)
	return contractFailure(path, 'an issue path contains an invalid segment')
}

/** Reads Standard Schema issues, prefixed with the validated value's path. */
export const snapshotStandardIssues = (
	issues: unknown,
	path: readonly (number | string)[],
	code: string,
): readonly ValidationIssue[] => {
	if (!isUnknownArray(issues)) {
		return contractFailure(path, 'the failure result has no issue array')
	}
	if (issues.length === 0) {
		return immutableArray([
			immutableRecord({
				code,
				message: 'Value does not satisfy the validator',
				path: immutableArray(path),
			}),
		])
	}
	return immutableArray(
		issues.map((issue) => {
			if (!isPlainRecord(issue) || typeof issue.message !== 'string') {
				return contractFailure(path, 'the validator returned a malformed issue')
			}
			const relative =
				issue.path === undefined
					? []
					: isUnknownArray(issue.path)
						? issue.path.map((segment) => readPathKey(segment, path))
						: contractFailure(path, 'an issue path must be an array')
			return immutableRecord({
				code,
				message: issue.message,
				path: immutableArray([...path, ...relative]),
			})
		}),
	)
}

/** Runs one Standard Schema validator, awaiting an asynchronous one. */
export const runStandardSchema = async (
	validator: object,
	value: unknown,
	path: readonly (number | string)[],
	code: string,
): Promise<FieldValidatorOutcome> => {
	const protocol: unknown = Reflect.get(validator, '~standard')
	const validate: unknown = isObjectOrFunction(protocol)
		? Reflect.get(protocol, 'validate')
		: undefined
	if (typeof validate !== 'function') {
		return contractFailure(path, 'the validator has no validate function')
	}

	let result: unknown
	try {
		result = await Reflect.apply(validate, protocol, [value])
	} catch (error: unknown) {
		return contractFailure(path, 'validate threw an exception', error)
	}
	if (!isPlainRecord(result)) {
		return contractFailure(path, 'validate returned a malformed result')
	}
	if (result.issues !== undefined) {
		return immutableRecord({
			issues: snapshotStandardIssues(result.issues, path, code),
			value,
		})
	}
	if (!Object.hasOwn(result, 'value')) {
		return contractFailure(path, 'the success result has no value')
	}
	// An equal clone keeps the input; a different output is what gets stored.
	return immutableRecord({
		issues: immutableArray([]),
		value: equalCanonicalValues(value, result.value) ? value : result.value,
	})
}

/** Reads what a validation function returned (ADR-0319). */
export const readValidationResult = (
	result: unknown,
	path: readonly (number | string)[],
	code: string,
): readonly ValidationIssue[] => {
	if (result === true) return immutableArray([])
	if (typeof result === 'string') {
		return immutableArray([
			immutableRecord({ code, message: result, path: immutableArray(path) }),
		])
	}
	if (
		isPlainRecord(result) &&
		typeof result.message === 'string' &&
		(result.code === undefined || typeof result.code === 'string')
	) {
		return immutableArray([
			immutableRecord({
				code: result.code ?? code,
				message: result.message,
				path: immutableArray(path),
			}),
		])
	}
	return contractFailure(
		path,
		'a validation function must return true, a message, or { message, code }',
	)
}

/**
 * Runs one field validator over a present non-null value: a Standard Schema
 * validator (whose output is stored) or a validation function.
 */
export const runFieldValidator = async (
	validator: unknown,
	value: unknown,
	path: readonly (number | string)[],
): Promise<FieldValidatorOutcome> => {
	if (isStandardSchema(validator)) {
		return runStandardSchema(validator, value, path, 'field.validation')
	}
	if (typeof validator !== 'function') {
		return contractFailure(
			path,
			'the validator is neither a schema nor a function',
		)
	}
	const result: unknown = await Reflect.apply(validator, undefined, [value])
	return immutableRecord({
		issues: readValidationResult(result, path, 'field.validation'),
		value,
	})
}
