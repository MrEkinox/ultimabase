import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { FrameworkError } from '../../foundation.js'
import type { RuntimeMutationValidationIssue } from '../pipeline/contracts.js'
import { throwRuntimeValidationIssues } from './runtime-field-validation.js'

const isIssue = (value: unknown): value is RuntimeMutationValidationIssue =>
	isPlainRecord(value) &&
	typeof value.code === 'string' &&
	typeof value.message === 'string' &&
	isUnknownArray(value.path) &&
	value.path.every(
		(segment) => typeof segment === 'string' || typeof segment === 'number',
	)

/** Reads the issues of a Core `VALIDATION_ERROR`, or `undefined` for any other error. */
export const readValidationErrorIssues = (
	error: unknown,
): readonly RuntimeMutationValidationIssue[] | undefined => {
	if (!(error instanceof FrameworkError) || error.code !== 'VALIDATION_ERROR') {
		return undefined
	}
	const details: unknown = error.publicDetails
	const issues: unknown = isPlainRecord(details) ? details.issues : undefined
	return isUnknownArray(issues) && issues.every(isIssue) ? issues : undefined
}

/** Throws one `VALIDATION_ERROR` carrying every issue, when there is any. */
export const throwMergedValidationIssues = (
	issues: readonly RuntimeMutationValidationIssue[],
): void => {
	if (issues.length > 0) throwRuntimeValidationIssues(issues)
}

/**
 * Prefixes the issue paths of one batch item's `VALIDATION_ERROR` with its
 * index, so `updateMany` issues name their target (ADR-0319).
 */
export const prefixValidationError = (
	error: unknown,
	index: number,
): unknown => {
	const issues = readValidationErrorIssues(error)
	if (issues === undefined || !(error instanceof FrameworkError)) return error
	const prefixed = immutableArray(
		issues.map((issue) =>
			immutableRecord({
				...issue,
				path: immutableArray([index, ...issue.path]),
			}),
		),
	)
	return new FrameworkError('VALIDATION_ERROR', error.message, {
		cause: error,
		publicMessage: error.publicMessage ?? 'The operation input is invalid.',
		publicDetails: { issues: prefixed },
		internalDetails: { issues: prefixed },
	})
}
