import { FrameworkError } from '../../foundation.js'
import type {
	AnyValidationIssueCode,
	ValidationIssue,
	ValidationIssuePath,
} from '../../schema/index.js'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

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
