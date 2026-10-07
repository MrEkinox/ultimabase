import { FrameworkError } from '@ultimabase/core'

/** Reads public validation issues while preserving unexpected failures. */
export const readValidationIssues = (error: unknown): readonly unknown[] => {
	if (!(error instanceof FrameworkError)) throw error
	const details: unknown = error.publicDetails
	const issues: unknown =
		typeof details === 'object' && details !== null
			? Reflect.get(details, 'issues')
			: undefined
	return Array.isArray(issues) ? issues : []
}
