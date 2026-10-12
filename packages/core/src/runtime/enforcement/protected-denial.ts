import { FrameworkError } from '../../foundation.js'

const protectedPolicyDenials = new WeakSet<object>()

/** Creates the only denial private target scopes may translate to absence. */
export const createProtectedPolicyDeniedError = (
	reason?: string,
): FrameworkError<'PERMISSION_DENIED'> => {
	const error = new FrameworkError(
		'PERMISSION_DENIED',
		reason === undefined
			? 'A protected policy denied the operation.'
			: `A protected policy denied the operation: ${reason}`,
		{ publicMessage: 'The operation is not permitted.' },
	)
	protectedPolicyDenials.add(error)
	return error
}

/** Rejects structural FrameworkError lookalikes and plugin-forged metadata. */
export const isProtectedPolicyDenied = (error: unknown): boolean =>
	typeof error === 'object' &&
	error !== null &&
	protectedPolicyDenials.has(error)
