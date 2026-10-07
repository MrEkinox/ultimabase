import { FrameworkError } from '../../foundation.js'

/** Recognizes native timeout aborts without copying their environment-owned reason. */
const isTimeoutAbort = (reason: unknown): boolean =>
	reason instanceof Error && reason.name === 'TimeoutError'

/**
 * Throws Core's transport-neutral cancellation failure after a signal aborts.
 *
 * Call this only at safe cooperative boundaries. It does not abort the signal,
 * detach running work, or expose the environment-owned abort reason.
 *
 * @example
 * ```ts
 * throwIfOperationCancelled(context.signal, { phase: 'before-callback' })
 * ```
 */
export const throwIfOperationCancelled = (
	signal: AbortSignal,
	internalDetails: Readonly<Record<string, unknown>> = {},
): void => {
	if (!signal.aborted) {
		return
	}

	throw new FrameworkError(
		'OPERATION_CANCELLED',
		'Operation execution was cancelled.',
		{
			publicMessage: 'The operation was cancelled.',
			internalDetails: {
				...internalDetails,
				reason: isTimeoutAbort(signal.reason)
					? 'deadline-exceeded'
					: 'request-aborted',
			},
		},
	)
}
